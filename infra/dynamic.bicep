targetScope = 'resourceGroup'

param clusterName string
param alertName string
param actionGroupName string

resource insights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: 'appi-${clusterName}'
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' existing = {
  name: actionGroupName
}

resource alert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: alertName
  location: 'global'
  tags: { application: 'payments' }
  properties: {
    description: 'Dynamic threshold for payment API request duration; enable after collecting a baseline.'
    enabled: false
    severity: 2
    scopes: [insights.id]
    targetResourceType: 'Microsoft.Insights/components'
    targetResourceRegion: insights.location
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'RequestDuration'
          criterionType: 'DynamicThresholdCriterion'
          metricNamespace: 'Microsoft.Insights/components'
          metricName: 'requests/duration'
          operator: 'GreaterThan'
          timeAggregation: 'Average'
          alertSensitivity: 'Medium'
          failingPeriods: {
            numberOfEvaluationPeriods: 4
            minFailingPeriodsToAlert: 3
          }
        }
      ]
    }
    actions: [{ actionGroupId: actionGroup.id }]
  }
}

output alertResourceId string = alert.id
