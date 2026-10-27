import { createModuleFederationConfig } from '@module-federation/vite'

export default createModuleFederationConfig({
  name: 'app1',
  filename: 'remoteEntry.js',
  exposes: {
    './App': './src/App.tsx',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^19.3.0' },
    'react-dom': { singleton: true, requiredVersion: '^19.3.0' },
    'react-router-dom': { singleton: true, requiredVersion: '^7.18.4' },
  },
})
