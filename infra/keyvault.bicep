targetScope = 'resourceGroup'

param vaultName string
param location string
param agentPrincipalId string
param deployerPrincipalId string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: { application: 'payments' }
  properties: {
    tenantId: tenant().tenantId
    sku: { name: 'standard', family: 'A' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
    accessPolicies: []
  }
}

resource reader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, agentPrincipalId, 'secrets-user')
  scope: vault
  properties: {
    principalId: agentPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

resource uploader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, deployerPrincipalId, 'secrets-officer')
  scope: vault
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  }
}

output secretUri string = '${vault.properties.vaultUri}secrets/github-app-private-key'
