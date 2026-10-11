targetScope = 'resourceGroup'

param clusterName string

resource cluster 'Microsoft.ContainerService/managedClusters@2024-10-01' existing = {
  name: clusterName
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: 'law-${clusterName}'
}

resource audit 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'payment-kubernetes-audit'
  scope: cluster
  properties: {
    workspaceId: workspace.id
    logAnalyticsDestinationType: 'Dedicated'
    logs: [
      {
        category: 'kube-audit-admin'
        enabled: true
      }
    ]
  }
}

output auditResourceId string = audit.id
