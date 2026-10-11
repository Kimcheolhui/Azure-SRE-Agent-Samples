targetScope = 'resourceGroup'

param grafanaName string
param location string

resource grafana 'Microsoft.Dashboard/grafana@2023-09-01' = {
  name: grafanaName
  location: location
  tags: { application: 'payments' }
  sku: { name: 'Standard' }
  properties: {
    publicNetworkAccess: 'Enabled'
    apiKey: 'Enabled'
    deterministicOutboundIP: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
  identity: { type: 'SystemAssigned' }
}

output endpoint string = grafana.properties.endpoint
output principalId string = grafana.identity.principalId
