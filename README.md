# LogMk
LogMk is a lightweight log monitoring solution for Kubernetes environments. It monitors pod logs, saves them in a central MySQL database, and provides a web portal for viewing and filtering log activity. Designed for simplicity, LogMk may not be robust enough for large enterprise-scale environments but is perfect for smaller setups or development environments.

## Features
- Real-Time Log Monitoring: View logs in real-time using the web portal.
- Centralized Storage: All logs are stored in a MySQL database.
- Filter and Search: Easily filter and search logs to find specific entries.
- Simple Deployment: Deploy a .NET 8 worker agent on all Kubernetes nodes to start collecting logs.

![image](https://github.com/user-attachments/assets/1dec77da-ef92-4a49-9da2-347f4668e420)


## Components
LogMk consists of three main components:

1.  .NET 8 Worker Agent

Deployed on all Kubernetes nodes.
Collects pod logs and sends them to the central API.

2.  Angular 18 Web Portal

Provides a user-friendly interface for viewing and filtering logs.
Utilizes SignalR for real-time log updates.

3.  .NET 8 API

- Receives log data from the worker agents.
- Exposes endpoints for the web portal to access log data.
- Implements SignalR for real-time communication with the web portal.

## Installation
### Prerequisites
- Kubernetes Cluster
- .NET 8 SDK (for building)
- MySQL Database
- Angular CLI (for web portal development)
### Setup
1. Deploy Worker Agent

Build and deploy the .NET 8 worker agent on all Kubernetes nodes.

``` bash
# Example command to build the worker agent
dotnet build src/LogMkWorkerAgent

# Example command to deploy the agent
kubectl apply -f deployment.yaml
```

2. Set Up MySQL Database

Create a MySQL database to store the logs. Update the connection string in the API configuration.

3. Deploy API

Build and deploy the .NET 8 API.

``` bash

dotnet build src/LogMkApi
dotnet publish src/LogMkApi -o /publish
```

4. Set Up Web Portal

Navigate to the web portal directory and install dependencies.

``` bash
cd src/LogMkWebPortal
npm install
```
Build and serve the web portal.

``` bash
ng build --prod
ng serve
```
## Usage
Access the web portal via your browser.
Use the filter and search functionalities to find specific logs.
Monitor logs in real-time through the SignalR integration.
The Api also hosts the web project
## Contributing
Contributions are welcome! Please fork the repository and submit a pull request.

## License
MIT License

## Acknowledgements
The .NET and Angular communities for their excellent frameworks.
