
![logmk-128](https://github.com/user-attachments/assets/15f1c5b9-f636-4135-b9c2-1cdeb1274bf6)

# LogMk

LogMk is a lightweight log monitoring solution for Kubernetes environments. It consists of three main components that work together to collect, store, and visualize pod logs in real-time. Designed for simplicity and ease of deployment, LogMk is perfect for smaller setups, development environments, and teams that need straightforward log monitoring without enterprise complexity.

## ✨ Features

- **Real-time Log Streaming**: View logs in real-time with SignalR WebSocket integration
- **Centralized Storage**: All logs stored in MySQL with configurable retention policies
- **Advanced Filtering**: Filter by namespace, pod, container, log level, and time ranges
- **Modern Web Interface**: Angular 20 SPA with dark theme and responsive design
- **Kubernetes Native**: DaemonSet deployment for automatic log collection across all nodes
- **JWT Authentication**: Secure access with token-based authentication and refresh tokens
- **Docker Ready**: Containerized components for easy deployment

![LogMk Dashboard](https://github.com/user-attachments/assets/b77821c6-9caf-4db9-b481-af058a6476fe)

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
- **Purpose**: User interface for log viewing and filtering
- **Technology**: Angular 20 with TypeScript and Bootstrap 5
- **Function**: Real-time log visualization with advanced filtering capabilities
- **Features**: Dark theme, responsive design, SignalR integration, date range picker

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

1. **Access the Web Interface**: Navigate to `http://localhost:6200` (development) or your deployed URL
2. **Authentication**: Log in with your configured credentials
3. **Real-time Monitoring**: Logs stream automatically via SignalR connection
4. **Filtering**: Use the sidebar filters to narrow down logs by:
   - Namespace
   - Pod name
   - Container
   - Log level
   - Time range
5. **Search**: Use the search bar for full-text log content searching

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

- **Backend**: .NET 9, C#, ServiceStack.OrmLite, SignalR
- **Frontend**: Angular 20, TypeScript, Bootstrap 5, ng2-charts
- **Database**: MySQL 8.0+
- **Authentication**: JWT with refresh tokens
- **Real-time**: SignalR WebSockets
- **Infrastructure**: Docker, Kubernetes, GitHub Actions

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
