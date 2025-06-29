# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LogMk is a lightweight log monitoring solution for Kubernetes environments. It consists of three main components:
- **LogMkAgent**: DaemonSet that collects pod logs from Kubernetes nodes
- **LogMkApi**: Central API server that stores logs in MySQL and provides real-time updates via SignalR
- **LogMkWeb**: Angular 20 web application for viewing and filtering logs

## Essential Commands

### Frontend Development (Angular)
```bash
# Navigate to web directory first
cd src/LogMkWeb

# Install dependencies
npm install

# Start development server (port 6200)
npm start

# Build for production
npm run prod

# Run tests
npm test

# Generate Angular components
ng generate component _components/component-name
```

### Backend Development (.NET)
```bash
# Build entire solution
dotnet build src/LogMk.sln

# Run API locally
dotnet run --project src/LogMkApi

# Run Agent locally
dotnet run --project src/LogMkAgent
```

### Docker Build Commands
```bash
# Build from src/ directory
docker build -f LogMkApi/Dockerfile -t logmk-api .
docker build -f LogMkAgent/Dockerfile -t logmk-agent .
```

## Architecture Overview

### Technology Stack
- **Backend**: .NET 9, C#, MySQL (ServiceStack.OrmLite), SignalR, JWT Authentication
- **Frontend**: Angular 20, TypeScript, Bootstrap 5, ng2-charts, SignalR Client
- **Infrastructure**: Docker, Kubernetes, GitHub Actions CI/CD

### Project Structure
```
src/
├── LogMkAgent/        # Log collector service
├── LogMkApi/          # REST API and SignalR hub
├── LogMkCommon/       # Shared models and utilities
└── LogMkWeb/          # Angular web application
```

### Key Architectural Patterns

1. **Real-time Communication**: SignalR WebSockets connect the Angular frontend to the API for live log streaming
2. **Authentication**: JWT tokens with refresh token support, stored in HttpOnly cookies
3. **Data Flow**: Agent → API → MySQL → SignalR → Angular
4. **Log Retention**: Configurable retention policies with automatic cleanup (default 30 days)

### Important Services and Components

**API Controllers**:
- `AuthController`: User authentication and token management
- `LogController`: Log retrieval and filtering endpoints

**SignalR Hub**:
- `LogHub`: Real-time log broadcasting to connected clients

**Angular Services**:
- `AuthService`: Authentication and token management
- `LogService`: Log retrieval and filtering
- `SignalrService`: Real-time log subscription

**Background Services**:
- `LogSummaryService`: Periodic log summarization
- `LogRetentionService`: Automatic log cleanup

### Configuration Files

- **API Settings**: `src/LogMkApi/appsettings.json` - JWT config, database connection, log retention
- **Agent Settings**: `src/LogMkAgent/appsettings.json` - API endpoint, log paths, batch settings
- **Angular Environments**: `src/LogMkWeb/src/environments/` - API URLs, SignalR endpoints

### Development Notes

1. The API project serves both the REST API and the Angular SPA in production
2. Angular uses standalone components (no NgModules)
3. The Agent uses file watching to monitor `/var/log/pods` directory
4. Logs are batched before sending to the API for efficiency
5. The project uses MySQL for storage with automatic schema migration on startup

### Angular Development Guidelines

**Modern Angular Patterns (Angular 17+)**
This project uses Angular's latest patterns and APIs. Always follow these guidelines:

**Control Flow Syntax**
```typescript
// ✅ Use @for for loops with track expression
@for (log of logs(); track log.id) {
  <div class="log-item">{{ log.line }}</div>
}

// ✅ Use @if for conditional rendering
@if (isLoggedIn()) {
  <div>Welcome, user!</div>
}

// ✅ Use @if with @else for conditional branches
@if (loading()) {
  <div>Loading...</div>
} @else {
  <div>Content loaded</div>
}

// ❌ Don't use old *ngFor syntax
<div *ngFor="let log of logs(); trackBy: trackByFn">{{ log.line }}</div>

// ❌ Don't use old *ngIf syntax
<div *ngIf="isLoggedIn()">Welcome, user!</div>
```

**Signal-based Inputs and Outputs**
Always use the new signal-based input/output functions instead of decorators:

```typescript
// ✅ Use signal inputs
export class MyComponent {
  data = input<string[]>([]);
  disabled = input<boolean>(false);
  placeholder = input<string>('Select option');
  
  // ✅ Use signal outputs
  selectionChange = output<any>();
  
  // ✅ Use computed signals for derived values
  processedData = computed(() => {
    return this.data().map(item => ({ label: item, value: item }));
  });
}

// ❌ Don't use decorator-based inputs/outputs
export class MyComponent {
  @Input() data: string[] = [];
  @Input() disabled = false;
  @Output() selectionChange = new EventEmitter<any>();
}
```

**ViewChild as Signals**
Use the signal-based viewChild function instead of the ViewChild decorator:

```typescript
// ✅ Use viewChild signal
export class MyComponent {
  triggerElement = viewChild<ElementRef>('trigger');
  myComponent = viewChild<MyOtherComponent>('myComp');
  
  someMethod() {
    // Access like a signal
    const element = this.triggerElement();
    if (element) {
      element.nativeElement.focus();
    }
  }
}

// ❌ Don't use ViewChild decorator
export class MyComponent {
  @ViewChild('trigger', { static: true }) triggerElement!: ElementRef;
  @ViewChild('myComp') myComponent!: MyOtherComponent;
}
```

**Dependency Injection with inject()**
Use the inject() function instead of constructor injection:

```typescript
// ✅ Use inject() function
export class MyComponent {
  private httpClient = inject(HttpClient);
  private router = inject(Router);
  private elementRef = inject(ElementRef);
}

// ❌ Don't use constructor injection
export class MyComponent {
  constructor(
    private httpClient: HttpClient,
    private router: Router,
    private elementRef: ElementRef
  ) {}
}
```

**Key Benefits of Modern Angular Patterns:**
- Better performance with signal-based reactivity
- Improved type safety and IntelliSense
- More readable and maintainable code
- Consistent with Angular's future direction
- Better tree-shaking and bundle size optimization

**Lucide Icons Configuration**
The project uses Lucide Angular icons. When adding new icons to components:
1. Import the icon in `app.config.ts` from the lucide-angular package
2. Add the icon to the `LucideAngularModule.pick()` configuration
3. Current icons: X, User, Box, Gauge, Clock, Search, ChevronDown, Settings, LogOut

Example:
```typescript
// Import new icons
import { NewIcon, AnotherIcon } from 'lucide-angular';

// Add to configuration
importProvidersFrom(LucideAngularModule.pick({ 
  X, User, Box, Gauge, Clock, Search, ChevronDown, Settings, LogOut,
  NewIcon, AnotherIcon 
}))
```

## Styling Architecture & Guidelines

### **Dark Theme System**
The application uses a comprehensive dark theme based on the Dracula color scheme with enhanced semantic color variables.

**Core Theme Philosophy:**
- Consistent dark theme across all components
- CSS custom properties for all colors and component-specific variables
- No hardcoded colors in component styles
- Accessible contrast ratios (WCAG compliant)
- Full-width layout design optimized for log viewing

### **CSS Variable System**

**Core Colors:**
```scss
--background: #282a36        // Main background
--foreground: #f8f8f2        // Primary text color
--primary: #bd93f9           // Brand/accent color (purple)
--secondary: #6272a4         // Secondary actions
--success: #50fa7b           // Success states
--danger: #ff5555            // Error states
--warning: #f1fa8c           // Warning states
--info: #7df9ff              // Info states
```

**Surface Colors:**
```scss
--surface: #343746                    // Component backgrounds
--surface-variant: #424450            // Input backgrounds, hover states
--surface-container: #44475a          // Cards, modals
--surface-container-high: #4d5066     // Elevated surfaces
--surface-container-highest: #565872  // Highest elevation
```

**Semantic Text Colors:**
```scss
--on-surface: #f8f8f2          // Primary text on surfaces
--on-surface-variant: #e0e0e0   // Secondary text
--on-surface-muted: #a0a0a0     // Muted text, placeholders
--on-primary: #1a1a1a          // Text on primary color
```

**Component-Specific Variables:**
```scss
--navbar-bg: rgba(52, 55, 70, 0.95)  // Navbar with transparency
--modal-bg: #343746                   // Modal backgrounds
--dropdown-bg: #343746                // Dropdown menus
--input-bg: #424450                   // Form inputs
--border-color: #44475a               // Default borders
--focus-ring: rgba(189, 147, 249, 0.3) // Focus indicators
```

### **Styling Rules & Best Practices**

**1. Component Styling Architecture:**
- ✅ **Use CSS variables exclusively** - Never hardcode colors
- ✅ **Minimal component-specific styles** - Rely on global utilities
- ✅ **Use `:host` selector** for component root styling
- ✅ **Import variables.scss** when using mixins
- ❌ **Avoid hardcoded colors, spacing, or sizing values**

**2. Color Usage Standards:**
```scss
// ✅ Correct - Using CSS variables
.my-component {
  background: var(--surface);
  color: var(--on-surface);
  border: 1px solid var(--border-color);
}

// ❌ Incorrect - Hardcoded colors
.my-component {
  background: #343746;
  color: #f8f8f2;
  border: 1px solid #44475a;
}
```

**3. Shared Component Mixins:**
Use provided mixins for consistent styling:

```scss
@import 'variables.scss';

.custom-button {
  @include button-base;
  @include button-variant(var(--primary));
}

.custom-input {
  @include form-control-base;
}

.custom-dropdown {
  @include dropdown-menu;
}

.custom-card {
  @include card-base;
}
```

**4. Form Controls Standardization:**
- All form controls must use `var(--input-bg)`, `var(--border-color)`, `var(--on-surface)`
- Focus states use `var(--focus-ring)` and `var(--primary)`
- Disabled states use `var(--disabled-bg)` and `var(--disabled-text)`
- Validation states use `var(--success-*)`, `var(--danger-*)` color sets

**5. Full-Width Layout Requirements:**
- Use `container-full-width` class for edge-to-edge layouts
- Apply `px-responsive` class for content that needs responsive padding
- Main content areas should expand to full viewport width
- Use `w-full` utility for elements that need 100% width

**6. Responsive Design Patterns:**
```scss
// ✅ Mobile-first responsive approach
.component {
  padding: 0.5rem; // Mobile default
  
  @media (min-width: 768px) {
    padding: 1rem; // Tablet
  }
  
  @media (min-width: 992px) {
    padding: 2rem; // Desktop
  }
}
```

### **File Organization & Dependencies**

**Global Style Files (in order):**
1. `variables.scss` - CSS variables, mixins, SCSS variables
2. `_scaffolding.scss` - Base HTML element styles
3. `_layouts.scss` - Container, grid system
4. `_button.scss` - Button component system
5. `_forms.scss` - Form controls and validation
6. `_alerts.scss` - Alert components
7. `_utils.scss` - Utility classes
8. `_bootstrap.scss` - Bootstrap-compatible utilities

**Component Style Requirements:**
- Each component should have minimal custom styles
- Import `variables.scss` if using mixins
- Use `:host` selector for component root
- Prefer global utilities over custom component styles

### **Accessibility & Performance**

**Accessibility Requirements:**
- Maintain WCAG AA contrast ratios (minimum 4.5:1)
- Use semantic color variables for consistent meaning
- Provide focus indicators with `var(--focus-ring)`
- Support keyboard navigation patterns

**Performance Guidelines:**
- CSS custom properties for runtime theming
- Avoid deep nesting (max 3 levels)
- Use efficient selectors and minimize specificity
- Leverage CSS containment for large lists (log viewport)

**Testing Requirements:**
- Test all components in dark theme
- Verify focus states and keyboard navigation
- Validate responsive behavior on mobile devices
- Ensure proper contrast ratios with accessibility tools

This styling system ensures a consistent, maintainable, and accessible dark theme throughout the LogMk application while supporting full-width layouts optimized for log monitoring workflows.