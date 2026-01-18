# LogMkWeb - Advanced Log Monitoring Interface

A modern Angular 20 web application for real-time log monitoring and analysis. Built with cutting-edge web technologies and optimized for production environments.

## 🚀 Features

### **Real-time Log Processing**
- Live log streaming via SignalR WebSocket integration
- Virtual scrolling for handling thousands of log entries
- Real-time error count badges with click-to-filter functionality
- Memory management with automatic cleanup

### **Advanced User Interface**
- **Dracula Dark Theme**: Optimized for extended viewing sessions
- **Mobile Responsive**: Full tablet and mobile support with adaptive layouts
- **Syntax Highlighting**: Comprehensive highlighting for JSON, URLs, stack traces, HTTP codes
- **View Modes**: Toggle between compact (dense) and expanded (spacious) layouts

### **Powerful Filtering & Search**
- Multi-dimensional filtering by pods, log levels, and time ranges
- Interactive chart time selection (drag to select custom ranges)
- Filter presets for saving and reusing filter combinations
- Full-text search with real-time term highlighting
- Context menus with right-click actions

### **Export & Productivity**
- Export filtered logs to CSV or JSON formats
- Keyboard shortcuts for power users (Ctrl+F, E for errors, W for warnings)
- One-click log copying with visual feedback
- Persistent user preferences via localStorage

## 🛠️ Technology Stack

- **Angular 20**: Latest Angular with signal-based architecture
- **TypeScript**: Type-safe development with modern ES features
- **Modern Patterns**: Uses new @if/@for control flow, input()/output() signals
- **Performance**: OnPush change detection, virtual scrolling, computed signals
- **Accessibility**: WCAG AA compliant with keyboard navigation support

## 📦 Dependencies

### Shared Component Library (rd-ui)
This project uses **rd-ui**, a shared Angular component library included as a git submodule at `src/rd-ui/`. The library provides reusable UI components with consistent theming.

**Included Components:**
- `rd-dropdown`: Multi-select dropdown with search, tri-state support
- `rd-modal`: Service-based modal system with layout slots
- `rd-toast`: Animated toast notifications
- `rd-tabs`: Signal-based tab navigation
- `rd-checkbox`: Custom styled checkbox
- `rd-input-switch`: Toggle switch component
- `rd-skeleton`: Loading skeleton placeholders
- `rd-spinner`: Loading spinner overlay
- `rd-progress-bar`: Progress indicator

### Core Dependencies
- `@angular/core`: Angular framework
- `@angular/common`: Common Angular modules
- `@microsoft/signalr`: Real-time communication
- `@auth0/angular-jwt`: JWT token management
- `lucide-angular`: Modern icon library
- `ngx-toastr`: Toast notifications
- `ng2-charts`: Chart.js integration
- `date-fns`: Date manipulation utilities

### Development Dependencies
- `@angular/cli`: Build system and development tools
- `@angular-eslint/builder`: Linting and code quality
- `ng-packagr`: Angular library packaging (for rd-ui)
- `typescript`: TypeScript compiler
- `sass`: CSS preprocessing

## 🚀 Development

### **Quick Start**
```bash
# Ensure submodules are initialized (from repo root)
git submodule update --init --recursive

# Install dependencies
npm install

# Start development server (port 6200)
# This automatically builds the rd-ui library first
npm start

# Navigate to http://localhost:6200
```

### **Available Scripts**
```bash
# Development
npm start              # Build rd-ui library + start dev server with watch
npm run serve          # Start dev server only (library must be built)
npm run serve:local    # Start with local environment config

# Library Build (rd-ui shared components)
npm run lib:build      # One-time build of rd-ui library
npm run lib:watch      # Build rd-ui in watch mode

# App Building
npm run build          # Development build
npm run prod           # Optimized production build

# Testing & Quality
npm test               # Unit tests with Karma
npm run lint           # ESLint code analysis

# Maintenance
npm run clean          # Remove dist folders

# Code Generation
ng generate component _components/my-component
ng generate service _services/my-service
ng generate pipe _pipes/my-pipe
```

### **Project Structure**
```
src/
├── app/
│   ├── _components/          # App-specific UI components
│   │   ├── modal/            # Template-based modal system
│   │   ├── context-menu/     # Right-click context menus
│   │   └── ...
│   ├── _pages/               # Feature pages
│   │   ├── main-log-page/    # Primary log monitoring interface
│   │   ├── login-page/       # Authentication
│   │   └── settings-page/    # User preferences
│   ├── _services/            # Business logic and state
│   │   ├── signalr.service   # Real-time communication
│   │   ├── view-mode.service # Display preferences
│   │   ├── export.service    # Log export functionality
│   │   └── ...
│   ├── _pipes/               # Data transformation
│   └── styles/               # Global styling system
├── rd-ui/                    # Git submodule - shared component library
│   └── projects/rd-ui/       # Library source code
├── environments/             # Environment configurations
└── styles.scss               # Global styles with rd-ui CSS variable mappings
```

## 🎨 Styling Architecture

### **Dark Theme System**
- Dracula-inspired color palette optimized for log viewing
- CSS custom properties for consistent theming
- Component-specific variables for maintainable styles
- WCAG AA contrast compliance

### **Responsive Design**
- Mobile-first approach with 3 breakpoints
- Adaptive layouts that optimize for screen real estate
- Touch-friendly controls for mobile devices
- Progressive enhancement for feature support

## 🚦 Performance Optimizations

- **Virtual Scrolling**: Handle 10,000+ log entries smoothly
- **OnPush Change Detection**: Minimize unnecessary re-renders
- **Lazy Loading**: Route-based code splitting
- **Signal Architecture**: Efficient reactive state management
- **Memory Management**: Automatic cleanup and garbage collection

## 🔧 Configuration

### **Environment Files**
- `environment.ts`: Development configuration
- `environment.prod.ts`: Production configuration
- `environment.local.ts`: Local development overrides

### **Build Configuration**
- **Angular CLI**: Modern build system with Vite bundler
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code quality enforcement
- **SCSS**: Advanced CSS preprocessing

## 📱 Browser Support

- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Mobile**: iOS Safari 14+, Android Chrome 90+
- **Progressive Enhancement**: Graceful degradation for older browsers

## 🤝 Contributing

1. Follow Angular style guide and project conventions
2. Use signal-based architecture for new components
3. Implement OnPush change detection strategy
4. Ensure mobile responsiveness and accessibility
5. Write unit tests for new functionality

## 📚 Key Architectural Patterns

### **Signal-Based Components**
```typescript
export class MyComponent {
  // Use inject() instead of constructor injection
  private service = inject(MyService);

  // Use input() for component inputs
  data = input<string[]>([]);

  // Use output() for component outputs
  selectionChange = output<any>();

  // Use computed() for derived state
  processedData = computed(() =>
    this.data().map(item => ({ label: item, value: item }))
  );
}
```

### **Modern Template Syntax**
```html
<!-- Use @if/@for instead of *ngIf/*ngFor -->
@if (loading()) {
  <div>Loading...</div>
} @else {
  @for (item of items(); track item.id) {
    <div>{{ item.name }}</div>
  }
}
```

This represents a production-ready, modern Angular application optimized for professional log monitoring environments.
