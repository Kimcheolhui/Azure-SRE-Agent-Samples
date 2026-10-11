targetScope = 'resourceGroup'

param clusterName string
param alertName string
param actionGroupName string
param createActionGroup bool = true
param location string = resourceGroup().location

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: 'law-${clusterName}'
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (createActionGroup) {
  name: actionGroupName
  location: 'global'
  tags: { application: 'payments' }
  properties: {
    groupShortName: 'sre-lab'
    enabled: true
    emailReceivers: []
  }
}

resource alert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: alertName
  location: location
  kind: 'LogAlert'
  tags: { application: 'payments' }
  properties: {
    displayName: alertName
    description: 'Payment request failures exceed five in five minutes.'
    enabled: true
    severity: 2
    scopes: [workspace.id]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    autoMitigate: true
    criteria: {
      allOf: [
        {
          query: loadTextContent('../queries/payment-failures.kql')
          metricMeasureColumn: 'FailedRequests'
          timeAggregation: 'Maximum'
          operator: 'GreaterThan'
          threshold: 5
          failingPeriods: {
            minFailingPeriodsToAlert: 1
            numberOfEvaluationPeriods: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [resourceId('Microsoft.Insights/actionGroups', actionGroupName)]
    }
  }
  dependsOn: [actionGroup]
}

output alertResourceId string = alert.id
output actionGroupResourceId string = resourceId('Microsoft.Insights/actionGroups', actionGroupName)
