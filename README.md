
![logmk-128](https://github.com/user-attachments/assets/15f1c5b9-f636-4135-b9c2-1cdeb1274bf6)

# LogMk

LogMk is a lightweight log monitoring solution for Kubernetes environments. It consists of three main components that work together to collect, store, and visualize pod logs in real-time. Designed for simplicity and ease of deployment, LogMk is perfect for smaller setups, development environments, and teams that need straightforward log monitoring without enterprise complexity.

## ✨ Features

### **Core Functionality**
- **Real-time Log Streaming**: Live log monitoring with SignalR WebSocket integration
- **Centralized Storage**: MySQL database with configurable retention policies (default 30 days)
- **Advanced Filtering**: Multi-dimensional filtering by pod, log level, time ranges, and full-text search
- **Interactive Chart Selection**: Click and drag on charts to select custom time ranges
- **Export Capabilities**: Export filtered logs to CSV or JSON with intelligent naming

### **User Experience**
- **Modern Dark Theme**: Dracula-inspired color scheme optimized for extended viewing
- **Mobile Responsive**: Full mobile and tablet support with adaptive layouts
- **Keyboard Shortcuts**: Power user navigation (Ctrl+F for search, E for errors, W for warnings)
- **Context Menus**: Right-click actions for filtering and copying log entries
- **View Modes**: Toggle between compact (dense) and expanded (spacious) layouts

### **Advanced Features**
- **Syntax Highlighting**: Comprehensive highlighting for JSON, URLs, IPs, stack traces, HTTP codes
- **Filter Presets**: Save and manage filter combinations for quick reuse
- **Copy Functionality**: One-click log copying with visual feedback
- **Error Count Badge**: Real-time error counter in navigation with click-to-filter
- **Timestamp Formats**: Toggle between relative ("5 min ago") and absolute timestamps

### **Performance & Accessibility**
- **Virtual Scrolling**: Handle thousands of logs with smooth performance
- **Memory Management**: Automatic cleanup and efficient DOM recycling
- **WCAG Compliance**: Accessible design with proper contrast ratios and keyboard navigation
- **Progressive Enhancement**: Graceful degradation for older browsers

<img width="1035" height="1162" alt="image" src="https://github.com/user-attachments/assets/ddfe177e-306a-414b-a38b-c5fb75ee03ef" />

<img width="484" height="1202" alt="image" src="https://github.com/user-attachments/assets/a789f7a9-f35f-41df-aca1-6dc2d064038e" />

<img width="203" height="882" alt="image" src="https://github.com/user-attachments/assets/f4582a42-e174-4673-818d-38ebc94c0d0a" />

## 🏗️ Architecture

LogMk consists of three main components:

### 1. **LogMkAgent** (DaemonSet)
- **Purpose**: Log collector deployed on every Kubernetes node
- **Technology**: .NET 9 background service
- **Function**: Monitors `/var/log/pods` directory and streams logs to the API
- **Features**: Batch processing, file watching, configurable log paths

### 2. **LogMkApi** (Central Server)
- **Purpose**: REST API server and SignalR hub
- **Technology**: .NET 9 with ServiceStack.OrmLite and SignalR
- **Function**: Receives logs from agents, stores in MySQL, broadcasts to web clients
- **Features**: JWT authentication, automatic schema migration, log retention management

### 3. **LogMkWeb** (Web Interface)
- **Purpose**: Advanced user interface for log monitoring and analysis
- **Technology**: Angular 20 with TypeScript, modern signal-based architecture
- **Function**: Real-time log visualization with comprehensive filtering and analysis tools
- **Features**:
  - Dracula dark theme with comprehensive syntax highlighting
  - Mobile-responsive design with adaptive layouts
  - Real-time SignalR integration with error count badges
  - Advanced filtering with presets and interactive chart selection
  - Export capabilities (CSV/JSON) with intelligent naming
  - Keyboard shortcuts and accessibility features
  - Context menus and copy functionality
  - Compact/expanded view modes for user preference

## 🚀 Quick Start

### Prerequisites
- **Kubernetes Cluster** (v1.20+)
- **MySQL Database** (v8.0+)
- **.NET 9 SDK** (for building from source)
- **Node.js 20+** and **Angular CLI** (for frontend development)
- **Docker** (for containerized deployment)

### Development Setup

#### 1. **Clone and Build**
```bash
git clone <repository-url>
cd LogMk2/src

# Build entire solution
dotnet build LogMk.sln
```

#### 2. **Database Setup**
```bash
# Create MySQL database
mysql -u root -p -e "CREATE DATABASE logmk;"

# Update connection string in src/LogMkApi/appsettings.json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=logmk;Uid=root;Pwd=yourpassword;"
  }
}
```

#### 3. **Run API Server**
```bash
# Navigate to API project
cd src/LogMkApi

# Run with hot reload
dotnet run
# API available at: https://localhost:7001
```

#### 4. **Run Web Application**
```bash
# Navigate to web project
cd src/LogMkWeb

# Install dependencies
npm install

# Start development server
npm start
# Web app available at: http://localhost:6200
```

#### 5. **Deploy Agent (Kubernetes)**
```bash
# Build and deploy agent
docker build -f LogMkAgent/Dockerfile -t logmk-agent .
kubectl apply -f k8s/agent-daemonset.yaml
```

### Production Deployment

#### Docker Build Commands
```bash
# From src/ directory
docker build -f LogMkApi/Dockerfile -t logmk-api .
docker build -f LogMkAgent/Dockerfile -t logmk-agent .
```

#### Kubernetes Deployment
```bash
# Deploy all components
kubectl apply -f k8s/
```

## 🎯 Usage

### **Getting Started**
1. **Access the Web Interface**: Navigate to `http://localhost:6200` (development) or your deployed URL
2. **Authentication**: Log in with your configured credentials
3. **Real-time Monitoring**: Logs stream automatically via SignalR connection

### **Advanced Filtering**
- **Multi-select Dropdowns**: Filter by log levels and pods with search and select-all options
- **Time Range Selection**: Use predefined ranges or select custom ranges by dragging on charts
- **Full-text Search**: Search log content with real-time highlighting of matching terms
- **Filter Presets**: Save frequently used filter combinations for quick access

### **Keyboard Shortcuts**
- `Ctrl/Cmd+F` - Focus search input
- `Ctrl/Cmd+Shift+C` - Clear all active filters
- `E` - Show only error logs
- `W` - Show only warning logs
- Arrow keys - Navigate through log entries
- Enter - Open detailed log view

### **Context Actions**
- **Right-click any log entry** for context menu with:
  - Filter by specific pod or log level
  - Hide logs from specific sources
  - Copy log content
  - View detailed log information

### **View Customization**
- **View Modes**: Toggle between compact (dense) and expanded (spacious) layouts
- **Timestamp Formats**: Switch between relative ("5 min ago") and absolute timestamps
- **Export Options**: Download filtered logs as CSV or JSON with metadata

## 📋 Configuration

### API Configuration (`src/LogMkApi/appsettings.json`)
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=logmk;Uid=root;Pwd=password;"
  },
  "JwtSettings": {
    "SecretKey": "your-secret-key",
    "ExpiryMinutes": 60,
    "RefreshTokenExpiryDays": 7
  },
  "LogRetention": {
    "RetentionDays": 30,
    "CleanupIntervalHours": 24
  }
}
```

### Agent Configuration (`src/LogMkAgent/appsettings.json`)
```json
{
  "ApiSettings": {
    "BaseUrl": "https://logmk-api:7001",
    "BatchSize": 100,
    "BatchIntervalSeconds": 5
  },
  "LogPaths": [
    "/var/log/pods"
  ]
}
```

## 🛠️ Development

### Frontend Development
```bash
cd src/LogMkWeb

# Generate new component
ng generate component _components/my-component

# Run tests
npm test

# Build for production
npm run prod
```

### Backend Development
```bash
# Build solution
dotnet build src/LogMk.sln

# Run specific project
dotnet run --project src/LogMkApi
dotnet run --project src/LogMkAgent
```

## 📝 Tech Stack

### **Backend**
- **.NET 9**: Modern C# with high-performance runtime
- **ServiceStack.OrmLite**: Lightweight ORM for MySQL integration
- **SignalR**: Real-time WebSocket communication
- **JWT Authentication**: Secure token-based auth with refresh tokens

### **Frontend**
- **Angular 20**: Latest Angular with signal-based architecture
- **TypeScript**: Type-safe development with modern ES features
- **CSS Variables**: Dynamic theming with Dracula color scheme
- **Virtual Scrolling**: High-performance rendering for large datasets
- **PWA Ready**: Progressive Web App capabilities

### **Libraries & Tools**
- **Lucide Angular**: Modern icon library with 1000+ icons
- **ng2-charts**: Chart.js integration for interactive visualizations
- **ngx-toastr**: Toast notifications for user feedback
- **date-fns**: Comprehensive date manipulation utilities
- **@iharbeck/ngx-virtual-scroller**: Optimized virtual scrolling

### **Development & Deployment**
- **Angular CLI**: Modern build system with Vite bundler
- **ESLint & Prettier**: Code quality and formatting
- **Docker Multi-stage**: Optimized container builds
- **Kubernetes**: Cloud-native deployment with DaemonSets
- **GitHub Actions**: CI/CD pipeline automation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- The .NET and Angular communities for their excellent frameworks
- SignalR team for real-time communication capabilities
- Bootstrap team for the responsive UI framework
- Kubernetes community for container orchestration
