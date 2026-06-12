# camaflouge - minimal mock server

This adds a minimal `server.js` that reads `config.yml` and serves the configured `mocks_dir` over HTTP.

Quick start:

```powershell
npm install
npm start
```

The server uses the `protocols.http` settings in `config.yml` for `port` and `mocks_dir`.

Getting Started
Camouflage is an NPM package, therefore to install Camouflage, you'd need to install NodeJS (>v14) first, if you haven't already done so.
Install Camouflage: npm install -g camouflage-server
Run camouflage --version to validate the installation was successful.
Create an empty directory anywhere in your machine and navigate to it in your terminal.
For npm and yarn, execute command camouflage init, or use npx degit camouflagejs/init myproject irrespective of your pacakge manager, to initialize a Camouflage project.
This creates a basic skeleton of the folders you'd need in order to get started. You can modify these folders as per your requirements.
Start the Camouflage server by initializing it with a config.yml file: camouflage --config config.yml

