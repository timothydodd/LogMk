import { isPlatformServer } from '@angular/common';
import {
    ChangeDetectorRef,
    Component,
    ElementRef,
    HostListener,
    NgZone,
    OnChanges,
    OnDestroy,
    OnInit,
    PLATFORM_ID,
    Renderer2,
    computed,
    contentChild,
    effect,
    inject,
    input,
    output,
    signal,
    viewChild
} from '@angular/core';


import * as tween from '@tweenjs/tween.js';

export interface VirtualScrollerDefaultOptions {
    checkResizeInterval: number
    modifyOverflowStyleOfParentScroll: boolean,
    resizeBypassRefreshThreshold: number,
    scrollAnimationTime: number;
    scrollDebounceTime: number;
    scrollThrottlingTime: number;
    scrollbarHeight?: number;
    scrollbarWidth?: number;
    stripedTable: boolean
}

export function VIRTUAL_SCROLLER_DEFAULT_OPTIONS_FACTORY(): VirtualScrollerDefaultOptions {
    return {
        checkResizeInterval: 1000,
        modifyOverflowStyleOfParentScroll: true,
        resizeBypassRefreshThreshold: 5,
        scrollAnimationTime: 750,
        scrollDebounceTime: 0,
        scrollThrottlingTime: 0,
        stripedTable: false
    };
}

export interface WrapGroupDimensions {
    maxChildSizePerWrapGroup: WrapGroupDimension[] | undefined[];
    numberOfKnownWrapGroupChildSizes: number;
    sumOfKnownWrapGroupChildHeights: number;
    sumOfKnownWrapGroupChildWidths: number;
}

export interface WrapGroupDimension {
    childHeight: number;
    childWidth: number;
    items: any[];
}

export interface IDimensions {
    childHeight: number;
    childWidth: number;
    itemCount: number;
    itemsPerPage: number;
    itemsPerWrapGroup: number;
    maxScrollPosition: number;
    pageCount_fractional: number;
    scrollLength: number;
    viewportLength: number;
    wrapGroupsPerPage: number;
}

export interface IPageInfo {
    endIndex: number;
    endIndexWithBuffer: number;
    maxScrollPosition: number;
    scrollEndPosition: number;
    scrollStartPosition: number;
    startIndex: number;
    startIndexWithBuffer: number;
}

export interface IViewport extends IPageInfo {
    padding: number;
    scrollLength: number;
    scrollbarLength: number;
}


@Component({
    selector: 'virtual-scroller,[virtualScroller]',
    exportAs: 'virtualScroller',
    template: `
        <div class="total-padding" #invisiblePadding></div>
        <div class="scrollable-content" #content>
            <ng-content></ng-content>
        </div>
    `,
    host: {
        '[class.horizontal]': 'horizontal()',
        '[class.vertical]': '!horizontal()',
        '[class.selfScroll]': '!parentScroll()',
        '[class.rtl]': 'RTL()'
    },
    styles: [`
        :host {
            position: relative;
            display: block;
            -webkit-overflow-scrolling: touch;
        }

        :host.horizontal.selfScroll {
            overflow-y: visible;
            overflow-x: auto;
        }

        :host.horizontal.selfScroll.rtl {
            transform: scaleX(-1);
        }

        :host.vertical.selfScroll {
            overflow-y: auto;
            overflow-x: visible;
        }

        .scrollable-content {
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            max-width: 100vw;
            max-height: 100vh;
            position: absolute;
        }

        .scrollable-content ::ng-deep > * {
            box-sizing: border-box;
        }

        :host.horizontal {
            white-space: nowrap;
        }

        :host.horizontal .scrollable-content {
            display: flex;
        }

        :host.horizontal .scrollable-content ::ng-deep > * {
            flex-shrink: 0;
            flex-grow: 0;
            white-space: initial;
        }

        :host.horizontal.rtl .scrollable-content ::ng-deep > * {
            transform: scaleX(-1);
        }

        .total-padding {
            width: 1px;
            opacity: 0;
        }

        :host.horizontal .total-padding {
            height: 100%;
        }
    `],
    standalone: true
})
export class VirtualScrollerComponent implements OnInit, OnChanges, OnDestroy {
    public viewPortItems: any[] = [];
    public window = window;

    public get viewPortInfo(): IPageInfo {
        let pageInfo: IViewport = this.previousViewPort || <any>{};
        return {
            startIndex: pageInfo.startIndex || 0,
            endIndex: pageInfo.endIndex || 0,
            scrollStartPosition: pageInfo.scrollStartPosition || 0,
            scrollEndPosition: pageInfo.scrollEndPosition || 0,
            maxScrollPosition: pageInfo.maxScrollPosition || 0,
            startIndexWithBuffer: pageInfo.startIndexWithBuffer || 0,
            endIndexWithBuffer: pageInfo.endIndexWithBuffer || 0
        };
    }

    executeRefreshOutsideAngularZone = input<boolean>(false);
    enableUnequalChildrenSizes = input<boolean>(false);
    RTL = input<boolean>(false);
    useMarginInsteadOfTranslate = input<boolean>(false);
    modifyOverflowStyleOfParentScroll = input<boolean>(true);
    stripedTable = input<boolean>(false);
    scrollbarWidth = input<number>();
    scrollbarHeight = input<number>();
    childWidth = input<number>();
    childHeight = input<number>();
    ssrChildWidth = input<number>();
    ssrChildHeight = input<number>();
    ssrViewportWidth = input<number>(1920);
    ssrViewportHeight = input<number>(1080);

    bufferAmount = input<number>();
    private _computedBufferAmount = computed(() => {
        const inputValue = this.bufferAmount();
        if (typeof inputValue === 'number' && inputValue >= 0) {
            return inputValue;
        } else {
            return this.enableUnequalChildrenSizes() ? 5 : 0;
        }
    });

    scrollAnimationTime = input<number>();
    resizeBypassRefreshThreshold = input<number>();
    scrollThrottlingTime = input<number>();
    scrollDebounceTime = input<number>();

    protected onScroll: (() => void) = () => {};

    protected updateOnScrollFunction(): void {
        var sd = this.scrollDebounceTime();
        var st = this.scrollThrottlingTime();
        if (sd) {
            this.onScroll = <any>this.debounce(() => {
                this.refresh_internal(false);
            }, sd);
        } else if (st) {
            this.onScroll = <any>this.throttleTrailing(() => {
                this.refresh_internal(false);
            }, st);
        } else {
            this.onScroll = () => {
                this.refresh_internal(false);
            };
        }
    }

    protected checkScrollElementResizedTimer: number | undefined;
    checkResizeInterval = input<number>();

    items = input<any[]>([]);
    compareItems = input<(item1: any, item2: any) => boolean>((item1: any, item2: any) => item1 === item2);

    horizontal = input<boolean>(false);

    protected revertParentOverscroll(): void {
        const scrollElement = this.getScrollElement();
        if (scrollElement && this.oldParentScrollOverflow) {
            (scrollElement.style as any)['overflow-y'] = this.oldParentScrollOverflow.y;
            (scrollElement.style as any)['overflow-x'] = this.oldParentScrollOverflow.x;
        }

        this.oldParentScrollOverflow = undefined;
    }

    protected oldParentScrollOverflow: { x: string, y: string } | undefined;
    parentScroll = input<Element | Window>();

    vsUpdate = output<any[]>();
    vsChange = output<IPageInfo>();
    vsStart = output<IPageInfo>();
    vsEnd = output<IPageInfo>();


    protected contentElementRef = viewChild.required<ElementRef>('content');
    protected invisiblePaddingElementRef = viewChild.required<ElementRef>('invisiblePadding');
    protected headerElementRef = contentChild<ElementRef>('header');
    protected containerElementRef = contentChild<ElementRef>('container');

    public ngOnInit(): void {
        this.addScrollEventHandlers();
    }

    public ngOnDestroy(): void {
        this.removeScrollEventHandlers();
        this.revertParentOverscroll();
    }

    public ngOnChanges(changes: any): void {
        let indexLengthChanged = this.cachedItemsLength !== this.items.length;
        this.cachedItemsLength = this.items.length;

        const firstRun: boolean = !changes.items || !changes.items.previousValue || changes.items.previousValue.length === 0;
        this.refresh_internal(indexLengthChanged || firstRun);
    }

    public ngDoCheck(): void {
        if (this.cachedItemsLength !== this.items.length) {
            this.cachedItemsLength = this.items.length;
            this.refresh_internal(true);
            return;
        }
        var pvp = this.previousViewPort;
        if (pvp && this.viewPortItems && this.viewPortItems.length > 0) {
            let itemsArrayChanged = false;
            var items = this.items();
            var compareItemsFn = this.compareItems();
            for (let i = 0; i < this.viewPortItems.length; ++i) {
                if (!compareItemsFn(items[pvp.startIndexWithBuffer + i], this.viewPortItems[i])) {
                    itemsArrayChanged = true;
                    break;
                }
            }
            if (itemsArrayChanged) {
                this.refresh_internal(true);
            }
        }
    }

    public refresh(): void {
        this.refresh_internal(true);
    }

    public invalidateAllCachedMeasurements(): void {
        this.wrapGroupDimensions = {
            maxChildSizePerWrapGroup: [],
            numberOfKnownWrapGroupChildSizes: 0,
            sumOfKnownWrapGroupChildWidths: 0,
            sumOfKnownWrapGroupChildHeights: 0
        };

        this.minMeasuredChildWidth = undefined;
        this.minMeasuredChildHeight = undefined;

        this.refresh_internal(false);
    }

    public invalidateCachedMeasurementForItem(item: any): void {
        if (this.enableUnequalChildrenSizes()) {
            let index = this.items() && this.items().indexOf(item);
            if (index >= 0) {
                this.invalidateCachedMeasurementAtIndex(index);
            }
        } else {
            this.minMeasuredChildWidth = undefined;
            this.minMeasuredChildHeight = undefined;
        }

        this.refresh_internal(false);
    }

    public invalidateCachedMeasurementAtIndex(index: number): void {
        if (this.enableUnequalChildrenSizes()) {
            let cachedMeasurement = this.wrapGroupDimensions.maxChildSizePerWrapGroup[index];
            if (cachedMeasurement) {
                this.wrapGroupDimensions.maxChildSizePerWrapGroup[index] = undefined;
                --this.wrapGroupDimensions.numberOfKnownWrapGroupChildSizes;
                this.wrapGroupDimensions.sumOfKnownWrapGroupChildWidths -= cachedMeasurement.childWidth || 0;
                this.wrapGroupDimensions.sumOfKnownWrapGroupChildHeights -= cachedMeasurement.childHeight || 0;
            }
        } else {
            this.minMeasuredChildWidth = undefined;
            this.minMeasuredChildHeight = undefined;
        }

        this.refresh_internal(false);
    }

    public scrollInto(item: any, alignToBeginning: boolean = true, additionalOffset: number = 0, animationMilliseconds?: number, animationCompletedCallback?: () => void): void {
        let index: number = this.items().indexOf(item);
        if (index === -1) {
            return;
        }

        this.scrollToIndex(index, alignToBeginning, additionalOffset, animationMilliseconds, animationCompletedCallback);
    }

    public scrollToIndex(index: number, alignToBeginning: boolean = true, additionalOffset: number = 0, animationMilliseconds?: number, animationCompletedCallback?: () => void): void {
        let maxRetries: number = 5;

        let retryIfNeeded = () => {
            --maxRetries;
            if (maxRetries <= 0) {
                if (animationCompletedCallback) {
                    animationCompletedCallback();
                }
                return;
            }

            let dimensions = this.calculateDimensions();
            let desiredStartIndex = Math.min(Math.max(index, 0), dimensions.itemCount - 1);
            if (this.previousViewPort?.startIndex === desiredStartIndex) {
                if (animationCompletedCallback) {
                    animationCompletedCallback();
                }
                return;
            }

            this.scrollToIndex_internal(index, alignToBeginning, additionalOffset, 0, retryIfNeeded);
        };

        this.scrollToIndex_internal(index, alignToBeginning, additionalOffset, animationMilliseconds, retryIfNeeded);
    }

    protected scrollToIndex_internal(index: number, alignToBeginning: boolean = true, additionalOffset: number = 0, animationMilliseconds?: number, animationCompletedCallback?: () => void): void {
        const resolvedAnimationTime = animationMilliseconds === undefined ? this.scrollAnimationTime() : animationMilliseconds;

        let dimensions = this.calculateDimensions();
        let scroll = this.calculatePadding(index, dimensions) + additionalOffset;
        if (!alignToBeginning) {
            scroll -= dimensions.wrapGroupsPerPage * (dimensions as any)[this._childScrollDim];
        }

        this.scrollToPosition(scroll, resolvedAnimationTime, animationCompletedCallback);
    }

    public scrollToPosition(scrollPosition: number, animationMilliseconds?: number, animationCompletedCallback?: () => void): void {
        scrollPosition += this.getElementsOffset();

        const resolvedAnimationTime = animationMilliseconds === undefined ? this.scrollAnimationTime() : animationMilliseconds;

        let scrollElement = this.getScrollElement();

        let animationRequest: number;

        if (this.currentTween) {
            this.currentTween.stop();
            this.currentTween = undefined;
        }

        if (!resolvedAnimationTime) {
            this.renderer.setProperty(scrollElement, this._scrollType, scrollPosition);
            this.refresh_internal(false, animationCompletedCallback);
            return;
        }

        const tweenConfigObj = {scrollPosition: (scrollElement as any)[this._scrollType]};

        let newTween = new tween.Tween(tweenConfigObj)
            .to({scrollPosition}, resolvedAnimationTime || 0)
            .easing(tween.Easing.Quadratic.Out)
            .onUpdate((data) => {
                if (isNaN(data.scrollPosition)) {
                    return;
                }
                this.renderer.setProperty(scrollElement, this._scrollType, data.scrollPosition);
                this.refresh_internal(false);
            })
            .onStop(() => {
                cancelAnimationFrame(animationRequest);
            })
            .start();

        const animate = (time?: number) => {
            if (!newTween['isPlaying']()) {
                return;
            }

            newTween.update(time);
            if (tweenConfigObj.scrollPosition === scrollPosition) {
                this.refresh_internal(false, animationCompletedCallback);
                return;
            }

            this.zone.runOutsideAngular(() => {
                animationRequest = requestAnimationFrame(animate);
            });
        };

        animate();
        this.currentTween = newTween;
    }

    protected readonly element = inject(ElementRef);
    protected readonly renderer = inject(Renderer2);
    protected readonly zone = inject(NgZone);
    protected changeDetectorRef = inject(ChangeDetectorRef);
    protected platformId = inject(PLATFORM_ID);
    protected options = inject('virtual-scroller-default-options' as any, { optional: true });
    protected isAngularUniversalSSR: boolean;

    constructor() {
        this.isAngularUniversalSSR = isPlatformServer(this.platformId);

        this.resetWrapGroupDimensions();
        this.updateDirection();

        // Effect for enableUnequalChildrenSizes changes
        effect(() => {
            const enableUnequal = this.enableUnequalChildrenSizes();
            this.minMeasuredChildWidth = undefined;
            this.minMeasuredChildHeight = undefined;
        });

        // Effect for scrollThrottlingTime and scrollDebounceTime changes
        effect(() => {
            const throttlingTime = this.scrollThrottlingTime();
            const debounceTime = this.scrollDebounceTime();
            this.updateOnScrollFunction();
        });

        // Effect for checkResizeInterval changes
        effect(() => {
            const interval = this.checkResizeInterval();
            this.addScrollEventHandlers();
        });

        // Effect for items changes
        effect(() => {
            const currentItems = this.items();
            this.refresh_internal(true);
        });

        // Effect for horizontal changes
        effect(() => {
            const isHorizontal = this.horizontal();
            this.updateDirection();
        });

        // Effect for parentScroll changes
        effect(() => {
            const parentScrollValue = this.parentScroll();
            this.revertParentOverscroll();
            this.addScrollEventHandlers();

            const scrollElement = this.getScrollElement();
            if (this.modifyOverflowStyleOfParentScroll() && scrollElement !== this.element.nativeElement) {
                this.oldParentScrollOverflow = {x: (scrollElement.style as any)['overflow-x'], y: (scrollElement.style as any)['overflow-y']};
                (scrollElement.style as any)['overflow-y'] = this.horizontal() ? 'visible' : 'auto';
                (scrollElement.style as any)['overflow-x'] = this.horizontal() ? 'auto' : 'visible';
            }
        });
    }

    protected getElementSize(element: HTMLElement): any {
        let result = element.getBoundingClientRect();
        let styles = getComputedStyle(element);
        let marginTop = parseInt((styles as any)['margin-top'], 10) || 0;
        let marginBottom = parseInt((styles as any)['margin-bottom'], 10) || 0;
        let marginLeft = parseInt((styles as any)['margin-left'], 10) || 0;
        let marginRight = parseInt((styles as any)['margin-right'], 10) || 0;

        return {
            top: result.top + marginTop,
            bottom: result.bottom + marginBottom,
            left: result.left + marginLeft,
            right: result.right + marginRight,
            width: result.width + marginLeft + marginRight,
            height: result.height + marginTop + marginBottom
        };
    }

    protected previousScrollBoundingRect: ClientRect | undefined;

    protected checkScrollElementResized(): void {
        let boundingRect = this.getElementSize(this.getScrollElement());

        let sizeChanged: boolean;
        if (!this.previousScrollBoundingRect) {
            sizeChanged = true;
        } else {
            let widthChange = Math.abs(boundingRect.width - this.previousScrollBoundingRect.width);
            let heightChange = Math.abs(boundingRect.height - this.previousScrollBoundingRect.height);
            const threshold = this.resizeBypassRefreshThreshold() || 5;
            sizeChanged = widthChange > threshold || heightChange > threshold;
        }

        if (sizeChanged) {
            this.previousScrollBoundingRect = boundingRect;
            if (boundingRect.width > 0 && boundingRect.height > 0) {
                this.refresh_internal(false);
            }
        }
    }

    protected _invisiblePaddingProperty: string = 'height';
    protected _offsetType: string = 'offsetTop';
    protected _scrollType: string = 'scrollTop';
    protected _pageOffsetType: string = 'pageYOffset';
    protected _childScrollDim: string = 'childHeight';
    protected _translateDir: string = 'translateY';
    protected _marginDir: string = 'margin-top';

    protected updateDirection(): void {
        if (this.horizontal()) {
            this._childScrollDim = 'childWidth';
            this._invisiblePaddingProperty = 'width';
            this._marginDir = 'margin-left';
            this._offsetType = 'offsetLeft';
            this._pageOffsetType = 'pageXOffset';
            this._scrollType = 'scrollLeft';
            this._translateDir = 'translateX';
        } else {
            this._childScrollDim = 'childHeight';
            this._invisiblePaddingProperty = 'height';
            this._marginDir = 'margin-top';
            this._offsetType = 'offsetTop';
            this._pageOffsetType = 'pageYOffset';
            this._scrollType = 'scrollTop';
            this._translateDir = 'translateY';
        }
    }

    protected debounce(func: Function, wait: number): Function {
        const throttled = this.throttleTrailing(func, wait) as any;
        const result = function (this: any) {
            throttled.cancel();
            throttled.apply(this, arguments);
        } as any;
        result.cancel = function () {
            throttled.cancel();
        };

        return result;
    }

    protected throttleTrailing(func: Function, wait: number): Function {
        let timeout: any = undefined;
        let _arguments: IArguments;
        const result = function (this: any) {
            const _this = this;
            _arguments = arguments;

            if (timeout) {
                return;
            }

            if (wait <= 0) {
                func.apply(_this, _arguments);
            } else {
                timeout = setTimeout(function () {
                    timeout = undefined;
                    func.apply(_this, _arguments);
                }, wait);
            }
        } as any;
        result.cancel = function () {
            if (timeout) {
                clearTimeout(timeout);
                timeout = undefined;
            }
        };

        return result;
    }

    protected calculatedScrollbarWidth: number = 0;
    protected calculatedScrollbarHeight: number = 0;

    protected padding: number = 0;
    protected previousViewPort :IViewport = <any>{}
    protected currentTween: tween.Tween<any> | undefined;
    protected cachedItemsLength: number = 0;
    
    protected disposeScrollHandler: (() => void) | undefined;
    protected disposeResizeHandler: (() => void) | undefined;

    protected refresh_internal(itemsArrayModified: boolean, refreshCompletedCallback?: () => void, maxRunTimes: number = 2): void {
        //note: maxRunTimes is to force it to keep recalculating if the previous iteration caused a re-render (different sliced items in viewport or scrollPosition changed).
        //The default of 2x max will probably be accurate enough without causing too large a performance bottleneck
        //The code would typically quit out on the 2nd iteration anyways. The main time it'd think more than 2 runs would be necessary would be for vastly different sized child items or if this is the 1st time the items array was initialized.
        //Without maxRunTimes, If the user is actively scrolling this code would become an infinite loop until they stopped scrolling. This would be okay, except each scroll event would start an additional infinte loop. We want to short-circuit it to prevent this.

        var vp =  this.previousViewPort;
        if (itemsArrayModified && vp && vp.scrollStartPosition > 0) {
            //if items were prepended, scroll forward to keep same items visible
            let oldViewPort = vp;
            let oldViewPortItems = this.viewPortItems;

            let oldRefreshCompletedCallback = refreshCompletedCallback;
            refreshCompletedCallback = () => {
                let scrollLengthDelta = vp.scrollLength - oldViewPort.scrollLength;
                if (scrollLengthDelta > 0 && this.viewPortItems) {
                    let oldStartItem = oldViewPortItems[0];
                    const currentItems = this.items();
                    const compareItemsFn = this.compareItems();
                    let oldStartItemIndex = currentItems.findIndex((x: any) => compareItemsFn(oldStartItem, x));
                    if (oldStartItemIndex > vp.startIndexWithBuffer) {
                        let itemOrderChanged = false;
                        for (let i = 1; i < this.viewPortItems.length; ++i) {
                            if (!compareItemsFn(currentItems[oldStartItemIndex + i], oldViewPortItems[i])) {
                                itemOrderChanged = true;
                                break;
                            }
                        }

                        if (!itemOrderChanged) {
                            this.scrollToPosition(vp.scrollStartPosition + scrollLengthDelta, 0, oldRefreshCompletedCallback);
                            return;
                        }
                    }
                }

                if (oldRefreshCompletedCallback) {
                    oldRefreshCompletedCallback();
                }
            };
        }

        this.zone.runOutsideAngular(() => {
            requestAnimationFrame(() => {

                if (itemsArrayModified) {
                    this.resetWrapGroupDimensions();
                }
                let viewport = this.calculateViewport();
                var pvp = this.previousViewPort;
                let startChanged = itemsArrayModified || viewport.startIndex !== pvp.startIndex;
                let endChanged = itemsArrayModified || viewport.endIndex !== pvp.endIndex;
                let scrollbarLengthChanged = viewport.scrollbarLength !== pvp.scrollbarLength;
                let paddingChanged = viewport.padding !== pvp.padding;
                let scrollPositionChanged = viewport.scrollStartPosition !== pvp.scrollStartPosition || viewport.scrollEndPosition !== pvp.scrollEndPosition || viewport.maxScrollPosition !== pvp.maxScrollPosition;

                this.previousViewPort = viewport;

                if (scrollbarLengthChanged) {
                    const invisiblePadding = this.invisiblePaddingElementRef();
                    if (invisiblePadding) {
                        this.renderer.setStyle(invisiblePadding.nativeElement, this._invisiblePaddingProperty, `${viewport.scrollLength}px`);
                    }
                }

                if (paddingChanged) {
                    const content = this.contentElementRef();
                    if (content) {
                        if (this.useMarginInsteadOfTranslate()) {
                            this.renderer.setStyle(content.nativeElement, this._marginDir, `${viewport.padding}px`);
                        } else {
                            this.renderer.setStyle(content.nativeElement, 'transform', `${this._translateDir}(${viewport.padding}px)`);
                            this.renderer.setStyle(content.nativeElement, 'webkitTransform', `${this._translateDir}(${viewport.padding}px)`);
                        }
                    }
                }

                const headerElement = this.headerElementRef();
                if (headerElement) {
                    let scrollPosition = (this.getScrollElement() as any)[this._scrollType];
                    let containerOffset = this.getElementsOffset();
                    let offset = Math.max(scrollPosition - viewport.padding - containerOffset + headerElement.nativeElement.clientHeight, 0);
                    this.renderer.setStyle(headerElement.nativeElement, 'transform', `${this._translateDir}(${offset}px)`);
                    this.renderer.setStyle(headerElement.nativeElement, 'webkitTransform', `${this._translateDir}(${offset}px)`);
                }

                const changeEventArg: IPageInfo | undefined = (startChanged || endChanged) ? {
                    startIndex: viewport.startIndex,
                    endIndex: viewport.endIndex,
                    scrollStartPosition: viewport.scrollStartPosition,
                    scrollEndPosition: viewport.scrollEndPosition,
                    startIndexWithBuffer: viewport.startIndexWithBuffer,
                    endIndexWithBuffer: viewport.endIndexWithBuffer,
                    maxScrollPosition: viewport.maxScrollPosition
                } : undefined;


                if (startChanged || endChanged || scrollPositionChanged) {
                    const handleChanged = () => {
                        // update the scroll list to trigger re-render of components in viewport
                        this.viewPortItems = viewport.startIndexWithBuffer >= 0 && viewport.endIndexWithBuffer >= 0 ? this.items().slice(viewport.startIndexWithBuffer, viewport.endIndexWithBuffer + 1) : [];
                        this.vsUpdate.emit(this.viewPortItems);

                        if (startChanged && changeEventArg) {
                            this.vsStart.emit(changeEventArg);
                        }

                        if (endChanged && changeEventArg) {
                            this.vsEnd.emit(changeEventArg);
                        }

                        if ((startChanged || endChanged) && changeEventArg) {
                            this.changeDetectorRef.markForCheck();
                            this.vsChange.emit(changeEventArg);
                        }

                        if (maxRunTimes > 0) {
                            this.refresh_internal(false, refreshCompletedCallback, maxRunTimes - 1);
                            return;
                        }

                        if (refreshCompletedCallback) {
                            refreshCompletedCallback();
                        }
                    };


                    if (this.executeRefreshOutsideAngularZone()) {
                        handleChanged();
                    } else {
                        this.zone.run(handleChanged);
                    }
                } else {
                    if (maxRunTimes > 0 && (scrollbarLengthChanged || paddingChanged)) {
                        this.refresh_internal(false, refreshCompletedCallback, maxRunTimes - 1);
                        return;
                    }

                    if (refreshCompletedCallback) {
                        refreshCompletedCallback();
                    }
                }
            });
        });
    }

    protected getScrollElement(): HTMLElement {
        const parent = this.parentScroll();
        return parent instanceof Window ? (document.scrollingElement || document.documentElement || document.body) as HTMLElement : (parent as HTMLElement) || this.element.nativeElement;
    }

    protected addScrollEventHandlers(): void {
        if (this.isAngularUniversalSSR) {
            return;
        }

        let scrollElement = this.getScrollElement();

        this.removeScrollEventHandlers();

        this.zone.runOutsideAngular(() => {
            const parent = this.parentScroll();
            if (parent instanceof Window) {
                this.disposeScrollHandler = this.renderer.listen('window', 'scroll', this.onScroll);
                this.disposeResizeHandler = this.renderer.listen('window', 'resize', this.onScroll);
            } else {
                this.disposeScrollHandler = this.renderer.listen(scrollElement, 'scroll', this.onScroll);
                const checkInterval = this.checkResizeInterval();
                if (checkInterval && checkInterval > 0) {
                    this.checkScrollElementResizedTimer = <any>setInterval(() => {
                        this.checkScrollElementResized();
                    }, checkInterval);
                }
            }
        });
    }

    protected removeScrollEventHandlers(): void {
        if (this.checkScrollElementResizedTimer) {
            clearInterval(this.checkScrollElementResizedTimer);
        }

        if (this.disposeScrollHandler) {
            this.disposeScrollHandler();
            this.disposeScrollHandler = undefined;
        }

        if (this.disposeResizeHandler) {
            this.disposeResizeHandler();
            this.disposeResizeHandler = undefined;
        }
    }

    protected getElementsOffset(): number {
        if (this.isAngularUniversalSSR) {
            return 0;
        }

        let offset = 0;

        const containerElement = this.containerElementRef();
        if (containerElement && containerElement.nativeElement) {
            offset += containerElement.nativeElement[this._offsetType];
        }

        const parent = this.parentScroll();
        if (parent) {
            let scrollElement = this.getScrollElement();
            let elementClientRect = this.getElementSize(this.element.nativeElement);
            let scrollClientRect = this.getElementSize(scrollElement);
            if (this.horizontal()) {
                offset += elementClientRect.left - scrollClientRect.left;
            } else {
                offset += elementClientRect.top - scrollClientRect.top;
            }

            if (!(parent instanceof Window)) {
                offset += (scrollElement as any)[this._scrollType];
            }
        }

        return offset;
    }

    protected countItemsPerWrapGroup(): number {
        if (this.isAngularUniversalSSR) {
            const ssrViewportHeight = this.ssrViewportHeight();
            const ssrChildHeight = this.ssrChildHeight();
            const ssrViewportWidth = this.ssrViewportWidth();
            const ssrChildWidth = this.ssrChildWidth();
            return Math.round(this.horizontal() ? ssrViewportHeight / (ssrChildHeight || 1) : ssrViewportWidth / (ssrChildWidth || 1));
        }

        let propertyName = this.horizontal() ? 'offsetLeft' : 'offsetTop';
        const containerElement = this.containerElementRef();
        const contentElement = this.contentElementRef();
        let children = (containerElement?.nativeElement || contentElement?.nativeElement)?.children;

        let childrenLength = children ? children.length : 0;
        if (childrenLength === 0) {
            return 1;
        }

        let firstOffset = children[0][propertyName];
        let result = 1;
        while (result < childrenLength && firstOffset === children[result][propertyName]) {
            ++result;
        }

        return result;
    }

    protected getScrollStartPosition(): number {
        let windowScrollValue = undefined;
        const parent = this.parentScroll();
        if (parent instanceof Window) {
            windowScrollValue = (window as any)[this._pageOffsetType];
        }

        return windowScrollValue || (this.getScrollElement() as any)[this._scrollType] || 0;
    }

    protected minMeasuredChildWidth: number | undefined;
    protected minMeasuredChildHeight: number | undefined;

    protected wrapGroupDimensions!: WrapGroupDimensions;

    protected resetWrapGroupDimensions(): void {
        const oldWrapGroupDimensions = this.wrapGroupDimensions;
        this.invalidateAllCachedMeasurements();

        if (!this.enableUnequalChildrenSizes() || !oldWrapGroupDimensions || oldWrapGroupDimensions.numberOfKnownWrapGroupChildSizes === 0) {
            return;
        }

        const itemsPerWrapGroup: number = this.countItemsPerWrapGroup();
        for (let wrapGroupIndex = 0; wrapGroupIndex < oldWrapGroupDimensions.maxChildSizePerWrapGroup.length; ++wrapGroupIndex) {
            const oldWrapGroupDimension: WrapGroupDimension | undefined = oldWrapGroupDimensions.maxChildSizePerWrapGroup[wrapGroupIndex];
            if (!oldWrapGroupDimension || !oldWrapGroupDimension.items || !oldWrapGroupDimension.items.length) {
                continue;
            }

            if (oldWrapGroupDimension.items.length !== itemsPerWrapGroup) {
                return;
            }

            let itemsChanged = false;
            let arrayStartIndex = itemsPerWrapGroup * wrapGroupIndex;
            const compareItemsFn = this.compareItems();
            const currentItems = this.items();
            for (let i = 0; i < itemsPerWrapGroup; ++i) {
                if (!compareItemsFn(oldWrapGroupDimension.items[i], currentItems[arrayStartIndex + i])) {
                    itemsChanged = true;
                    break;
                }
            }

            if (!itemsChanged) {
                ++this.wrapGroupDimensions.numberOfKnownWrapGroupChildSizes;
                this.wrapGroupDimensions.sumOfKnownWrapGroupChildWidths += oldWrapGroupDimension.childWidth || 0;
                this.wrapGroupDimensions.sumOfKnownWrapGroupChildHeights += oldWrapGroupDimension.childHeight || 0;
                this.wrapGroupDimensions.maxChildSizePerWrapGroup[wrapGroupIndex] = oldWrapGroupDimension;
            }
        }
    }

    protected calculateDimensions(): IDimensions {
        let scrollElement = this.getScrollElement();

        const maxCalculatedScrollBarSize: number = 25; // Note: Formula to auto-calculate doesn't work for ParentScroll, so we default to this if not set by consuming application
        this.calculatedScrollbarHeight = Math.max(Math.min(scrollElement.offsetHeight - scrollElement.clientHeight, maxCalculatedScrollBarSize), this.calculatedScrollbarHeight);
        this.calculatedScrollbarWidth = Math.max(Math.min(scrollElement.offsetWidth - scrollElement.clientWidth, maxCalculatedScrollBarSize), this.calculatedScrollbarWidth);

        let viewportWidth = scrollElement.offsetWidth - (this.scrollbarWidth() || this.calculatedScrollbarWidth || (this.horizontal() ? 0 : maxCalculatedScrollBarSize));
        let viewportHeight = scrollElement.offsetHeight - (this.scrollbarHeight() || this.calculatedScrollbarHeight || (this.horizontal() ? maxCalculatedScrollBarSize : 0));

        const containerElement = this.containerElementRef();
        const contentElement = this.contentElementRef();
        let content = containerElement?.nativeElement || contentElement?.nativeElement;

        let itemsPerWrapGroup = this.countItemsPerWrapGroup();
        let wrapGroupsPerPage;

        let defaultChildWidth;
        let defaultChildHeight;

        if (this.isAngularUniversalSSR) {
            viewportWidth = this.ssrViewportWidth();
            viewportHeight = this.ssrViewportHeight();
            defaultChildWidth = this.ssrChildWidth();
            defaultChildHeight = this.ssrChildHeight();
            let itemsPerRow = Math.max(Math.ceil(viewportWidth / (defaultChildWidth || 1)), 1);
            let itemsPerCol = Math.max(Math.ceil(viewportHeight / (defaultChildHeight || 1)), 1);
            wrapGroupsPerPage = this.horizontal() ? itemsPerRow : itemsPerCol;
        } else if (!this.enableUnequalChildrenSizes()) {
            if (content.children.length > 0) {
                const childWidth = this.childWidth();
                const childHeight = this.childHeight();
                if (!childWidth || !childHeight) {
                    if (!this.minMeasuredChildWidth && viewportWidth > 0) {
                        this.minMeasuredChildWidth = viewportWidth;
                    }
                    if (!this.minMeasuredChildHeight && viewportHeight > 0) {
                        this.minMeasuredChildHeight = viewportHeight;
                    }
                }

                let child = content.children[0];
                let clientRect = this.getElementSize(child);
                this.minMeasuredChildWidth = Math.min(this.minMeasuredChildWidth || Infinity, clientRect.width);
                this.minMeasuredChildHeight = Math.min(this.minMeasuredChildHeight || Infinity, clientRect.height);
            }

            defaultChildWidth = this.childWidth() || this.minMeasuredChildWidth || viewportWidth;
            defaultChildHeight = this.childHeight() || this.minMeasuredChildHeight || viewportHeight;
            let itemsPerRow = Math.max(Math.ceil(viewportWidth / (defaultChildWidth || 1)), 1);
            let itemsPerCol = Math.max(Math.ceil(viewportHeight / (defaultChildHeight || 1)), 1);
            wrapGroupsPerPage = this.horizontal() ? itemsPerRow : itemsPerCol;
        } else {
            var pvp = this.previousViewPort;
            let scrollOffset = (scrollElement as any)[this._scrollType] - (pvp ? pvp.padding : 0);

            let arrayStartIndex = pvp.startIndexWithBuffer || 0;
            let wrapGroupIndex = Math.ceil(arrayStartIndex / itemsPerWrapGroup);

            let maxWidthForWrapGroup = 0;
            let maxHeightForWrapGroup = 0;
            let sumOfVisibleMaxWidths = 0;
            let sumOfVisibleMaxHeights = 0;
            wrapGroupsPerPage = 0;

            for (let i = 0; i < content.children.length; ++i) {
                ++arrayStartIndex;
                let child = content.children[i];
                let clientRect = this.getElementSize(child);

                maxWidthForWrapGroup = Math.max(maxWidthForWrapGroup, clientRect.width);
                maxHeightForWrapGroup = Math.max(maxHeightForWrapGroup, clientRect.height);

                if (arrayStartIndex % itemsPerWrapGroup === 0) {
                    let oldValue = this.wrapGroupDimensions.maxChildSizePerWrapGroup[wrapGroupIndex];
                    if (oldValue) {
                        --this.wrapGroupDimensions.numberOfKnownWrapGroupChildSizes;
                        this.wrapGroupDimensions.sumOfKnownWrapGroupChildWidths -= oldValue.childWidth || 0;
                        this.wrapGroupDimensions.sumOfKnownWrapGroupChildHeights -= oldValue.childHeight || 0;
                    }

                    ++this.wrapGroupDimensions.numberOfKnownWrapGroupChildSizes;
                    const items = this.items().slice(arrayStartIndex - itemsPerWrapGroup, arrayStartIndex);
                    this.wrapGroupDimensions.maxChildSizePerWrapGroup[wrapGroupIndex] = {
                        childWidth: maxWidthForWrapGroup,
                        childHeight: maxHeightForWrapGroup,
                        items: items
                    };
                    this.wrapGroupDimensions.sumOfKnownWrapGroupChildWidths += maxWidthForWrapGroup;
                    this.wrapGroupDimensions.sumOfKnownWrapGroupChildHeights += maxHeightForWrapGroup;

                    if (this.horizontal()) {
                        let maxVisibleWidthForWrapGroup = Math.min(maxWidthForWrapGroup, Math.max(viewportWidth - sumOfVisibleMaxWidths, 0));
                        if (scrollOffset > 0) {
                            let scrollOffsetToRemove = Math.min(scrollOffset, maxVisibleWidthForWrapGroup);
                            maxVisibleWidthForWrapGroup -= scrollOffsetToRemove;
                            scrollOffset -= scrollOffsetToRemove;
                        }

                        sumOfVisibleMaxWidths += maxVisibleWidthForWrapGroup;
                        if (maxVisibleWidthForWrapGroup > 0 && viewportWidth >= sumOfVisibleMaxWidths) {
                            ++wrapGroupsPerPage;
                        }
                    } else {
                        let maxVisibleHeightForWrapGroup = Math.min(maxHeightForWrapGroup, Math.max(viewportHeight - sumOfVisibleMaxHeights, 0));
                        if (scrollOffset > 0) {
                            let scrollOffsetToRemove = Math.min(scrollOffset, maxVisibleHeightForWrapGroup);
                            maxVisibleHeightForWrapGroup -= scrollOffsetToRemove;
                            scrollOffset -= scrollOffsetToRemove;
                        }

                        sumOfVisibleMaxHeights += maxVisibleHeightForWrapGroup;
                        if (maxVisibleHeightForWrapGroup > 0 && viewportHeight >= sumOfVisibleMaxHeights) {
                            ++wrapGroupsPerPage;
                        }
                    }

                    ++wrapGroupIndex;

                    maxWidthForWrapGroup = 0;
                    maxHeightForWrapGroup = 0;
                }
            }

            let averageChildWidth = this.wrapGroupDimensions.sumOfKnownWrapGroupChildWidths / this.wrapGroupDimensions.numberOfKnownWrapGroupChildSizes;
            let averageChildHeight = this.wrapGroupDimensions.sumOfKnownWrapGroupChildHeights / this.wrapGroupDimensions.numberOfKnownWrapGroupChildSizes;
            defaultChildWidth = this.childWidth() || averageChildWidth || viewportWidth;
            defaultChildHeight = this.childHeight() || averageChildHeight || viewportHeight;

            if (this.horizontal()) {
                if (viewportWidth > sumOfVisibleMaxWidths) {
                    wrapGroupsPerPage += Math.ceil((viewportWidth - sumOfVisibleMaxWidths) / defaultChildWidth);
                }
            } else {
                if (viewportHeight > sumOfVisibleMaxHeights) {
                    wrapGroupsPerPage += Math.ceil((viewportHeight - sumOfVisibleMaxHeights) / defaultChildHeight);
                }
            }
        }

        let itemCount = this.items().length;
        let itemsPerPage = itemsPerWrapGroup * wrapGroupsPerPage;
        let pageCount_fractional = itemCount / itemsPerPage;
        let numberOfWrapGroups = Math.ceil(itemCount / itemsPerWrapGroup);

        let scrollLength = 0;

        let defaultScrollLengthPerWrapGroup = this.horizontal() ? defaultChildWidth : defaultChildHeight;
        if (this.enableUnequalChildrenSizes()) {
            let numUnknownChildSizes = 0;
            for (let i = 0; i < numberOfWrapGroups; ++i) {
                let childSize = this.wrapGroupDimensions.maxChildSizePerWrapGroup[i] && (this.wrapGroupDimensions.maxChildSizePerWrapGroup[i] as any)[this._childScrollDim];
                if (childSize) {
                    scrollLength += childSize;
                } else {
                    ++numUnknownChildSizes;
                }
            }

            scrollLength += Math.round(numUnknownChildSizes * (defaultScrollLengthPerWrapGroup || 0));
        } else {
            scrollLength = numberOfWrapGroups * (defaultScrollLengthPerWrapGroup || 0);
        }

        const headerElement = this.headerElementRef();
        if (headerElement) {
            scrollLength += headerElement.nativeElement.clientHeight;
        }

        let viewportLength = this.horizontal() ? viewportWidth : viewportHeight;
        let maxScrollPosition = Math.max(scrollLength - viewportLength, 0);

        return {
            childHeight: defaultChildHeight || 0,
            childWidth: defaultChildWidth || 0,
            itemCount: itemCount,
            itemsPerPage: itemsPerPage,
            itemsPerWrapGroup: itemsPerWrapGroup,
            maxScrollPosition: maxScrollPosition,
            pageCount_fractional: pageCount_fractional,
            scrollLength: scrollLength,
            viewportLength: viewportLength,
            wrapGroupsPerPage: wrapGroupsPerPage,
        };
    }

    protected cachedPageSize: number = 0;
    protected previousScrollNumberElements: number = 0;

    protected calculatePadding(arrayStartIndexWithBuffer: number, dimensions: IDimensions): number {
        if (dimensions.itemCount === 0) {
            return 0;
        }

        let defaultScrollLengthPerWrapGroup = (dimensions as any)[this._childScrollDim];
        let startingWrapGroupIndex = Math.floor(arrayStartIndexWithBuffer / dimensions.itemsPerWrapGroup) || 0;

        if (!this.enableUnequalChildrenSizes()) {
            return defaultScrollLengthPerWrapGroup * startingWrapGroupIndex;
        }

        let numUnknownChildSizes = 0;
        let result = 0;
        for (let i = 0; i < startingWrapGroupIndex; ++i) {
            let childSize = this.wrapGroupDimensions.maxChildSizePerWrapGroup[i] && (this.wrapGroupDimensions.maxChildSizePerWrapGroup[i] as any)[this._childScrollDim];
            if (childSize) {
                result += childSize;
            } else {
                ++numUnknownChildSizes;
            }
        }
        result += Math.round(numUnknownChildSizes * defaultScrollLengthPerWrapGroup);

        return result;
    }

    protected calculatePageInfo(scrollPosition: number, dimensions: IDimensions): IPageInfo {
        let scrollPercentage = 0;
        let scrollBottomPercentage = 1;
        let arrayStartIndex = 0;
        let arrayEndIndex = 0;
        if (this.enableUnequalChildrenSizes()) {
            const numberOfWrapGroups = Math.ceil(dimensions.itemCount / dimensions.itemsPerWrapGroup);
            let totalScrolledLength = 0;
            let defaultScrollLengthPerWrapGroup = (dimensions as any)[this._childScrollDim];
            let i = 0;
            for (; i < numberOfWrapGroups; ++i) {
                let childSize = this.wrapGroupDimensions.maxChildSizePerWrapGroup[i] && (this.wrapGroupDimensions.maxChildSizePerWrapGroup[i] as any)[this._childScrollDim];
                if (childSize) {
                    totalScrolledLength += childSize;
                } else {
                    totalScrolledLength += defaultScrollLengthPerWrapGroup;
                }

                if (scrollPosition < totalScrolledLength) {
                    scrollPercentage = i / numberOfWrapGroups;
                    break;
                }
            }
            let j = i + 1;
            for (; j < numberOfWrapGroups; ++j) {
                let childSize = this.wrapGroupDimensions.maxChildSizePerWrapGroup[j] && (this.wrapGroupDimensions.maxChildSizePerWrapGroup[j] as any)[this._childScrollDim];
                if (childSize) {
                    totalScrolledLength += childSize;
                }
                else {
                    totalScrolledLength += defaultScrollLengthPerWrapGroup;
                }
                if (scrollPosition + dimensions.viewportLength < totalScrolledLength) {
                    scrollBottomPercentage = j / numberOfWrapGroups;
                    break;
                }
            }
            
            arrayStartIndex = i * dimensions.itemsPerWrapGroup;
            arrayEndIndex = j * dimensions.itemsPerWrapGroup;
        } else {
            scrollPercentage = scrollPosition / dimensions.scrollLength;

            let startingArrayIndex_fractional = Math.min(Math.max(scrollPercentage * dimensions.pageCount_fractional, 0), dimensions.pageCount_fractional) * dimensions.itemsPerPage;
            let maxStart = dimensions.itemCount - dimensions.itemsPerPage - 1;
            arrayStartIndex = Math.min(Math.floor(startingArrayIndex_fractional), maxStart);
            arrayEndIndex = Math.ceil(startingArrayIndex_fractional) + dimensions.itemsPerPage - 1;
        }

        arrayStartIndex -= arrayStartIndex % dimensions.itemsPerWrapGroup; // round down to start of wrapGroup

        if (this.stripedTable()) {
            let bufferBoundary = 2 * dimensions.itemsPerWrapGroup;
            if (arrayStartIndex % bufferBoundary !== 0) {
                arrayStartIndex = Math.max(arrayStartIndex - arrayStartIndex % bufferBoundary, 0);
            }
        }

        let endIndexWithinWrapGroup = (arrayEndIndex + 1) % dimensions.itemsPerWrapGroup;
        if (endIndexWithinWrapGroup > 0) {
            arrayEndIndex += dimensions.itemsPerWrapGroup - endIndexWithinWrapGroup; // round up to end of wrapGroup
        }

        if (isNaN(arrayStartIndex)) {
            arrayStartIndex = 0;
        }
        if (isNaN(arrayEndIndex)) {
            arrayEndIndex = 0;
        }

        arrayStartIndex = Math.min(Math.max(arrayStartIndex, 0), dimensions.itemCount - 1);
        arrayEndIndex = Math.min(Math.max(arrayEndIndex, 0), dimensions.itemCount - 1);

        let bufferSize = this._computedBufferAmount() * dimensions.itemsPerWrapGroup;
        let startIndexWithBuffer = Math.min(Math.max(arrayStartIndex - bufferSize, 0), dimensions.itemCount - 1);
        let endIndexWithBuffer = Math.min(Math.max(arrayEndIndex + bufferSize, 0), dimensions.itemCount - 1);

        return {
            startIndex: arrayStartIndex,
            endIndex: arrayEndIndex,
            startIndexWithBuffer: startIndexWithBuffer,
            endIndexWithBuffer: endIndexWithBuffer,
            scrollStartPosition: scrollPosition,
            scrollEndPosition: scrollPosition + dimensions.viewportLength,
            maxScrollPosition: dimensions.maxScrollPosition
        };
    }

    protected calculateViewport(): IViewport {
        let dimensions = this.calculateDimensions();
        let offset = this.getElementsOffset();

        let scrollStartPosition = this.getScrollStartPosition();
        const parent = this.parentScroll();
        if (scrollStartPosition > (dimensions.scrollLength + offset) && !(parent instanceof Window)) {
            scrollStartPosition = dimensions.scrollLength;
        } else {
            scrollStartPosition -= offset;
        }
        scrollStartPosition = Math.max(0, scrollStartPosition);

        let pageInfo = this.calculatePageInfo(scrollStartPosition, dimensions);
        let newPadding = this.calculatePadding(pageInfo.startIndexWithBuffer, dimensions);
        let newScrollLength = Math.round(dimensions.scrollLength);

        return {
            startIndex: pageInfo.startIndex,
            endIndex: pageInfo.endIndex,
            startIndexWithBuffer: pageInfo.startIndexWithBuffer,
            endIndexWithBuffer: pageInfo.endIndexWithBuffer,
            padding: Math.round(newPadding),
            scrollLength: newScrollLength,
            scrollbarLength: newScrollLength + offset,
            scrollStartPosition: pageInfo.scrollStartPosition,
            scrollEndPosition: pageInfo.scrollEndPosition,
            maxScrollPosition: pageInfo.maxScrollPosition
        };
    }
}


