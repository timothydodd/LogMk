#See https://aka.ms/customizecontainer to learn how to customize your debug container and how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER app
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["LogMkApi/LogMkApi.csproj", "LogMkApi/"]
COPY ["LogMkCommon/LogMkCommon.csproj", "LogMkCommon/"]
COPY ["LogMkWeb/logmk.esproj", "LogMkWeb/"]
RUN dotnet restore "./LogMkApi/LogMkApi.csproj"
# Install Node.js and Angular CLI
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @angular/cli@21


COPY . .

# Build rd-ui library before main app build
WORKDIR "/src/LogMkWeb"
RUN npm install
RUN npm run lib:build
WORKDIR "/src"
RUN chmod +x ./LogMkApi/replace_vars.sh
RUN ./LogMkApi/replace_vars.sh ./LogMkWeb/src/environments

WORKDIR "/src/LogMkApi"
RUN dotnet build "./LogMkApi.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./LogMkApi.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "LogMkApi.dll"]
