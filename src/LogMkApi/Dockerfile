#See https://aka.ms/customizecontainer to learn how to customize your debug container and how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
USER app
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["LogMkApi/LogMkApi.csproj", "LogMkApi/"]
COPY ["LogMkCommon/LogMkCommon.csproj", "LogMkCommon/"]
COPY ["LogMkWeb\logmk.esproj", "LogMkWeb/"]
RUN dotnet restore "./LogMkApi/LogMkApi.csproj"
# Install Node.js and Angular CLI
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @angular/cli@18


COPY . .
RUN chmod +x ./api/replace_vars.sh
RUN ./api/replace_vars.sh ./web/home-dash/src/environments

WORKDIR "/src/LogMkApi"
RUN dotnet build "./LogMkApi.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./LogMkApi.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "LogMkApi.dll"]
