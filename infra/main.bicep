targetScope = 'resourceGroup'

@minLength(2)
@maxLength(40)
param clusterName string
param registryName string
param deployerObjectId string
param location string = resourceGroup().location
param nodeVmSize string = 'Standard_D4s_v6'
param privateCluster bool = false

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-${clusterName}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${clusterName}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: { name: 'Standard' }
  properties: { adminUserEnabled: false }
}

resource network 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: 'vnet-${clusterName}'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.70.0.0/16'] }
    subnets: [
      {
        name: 'snet-aks'
        properties: { addressPrefix: '10.70.0.0/24' }
      }
      {
        name: 'snet-agent'
        properties: {
          addressPrefix: '10.70.1.0/27'
          delegations: [
            {
              name: 'sre-agent'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
    ]
  }
}

resource clusterIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${clusterName}'
  location: location
}

resource networkAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(network.id, clusterIdentity.id, 'aks-network')
  scope: network
  properties: {
    principalId: clusterIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4d97b98b-1d4f-4787-a291-c67834d212e7')
  }
}

resource cluster 'Microsoft.ContainerService/managedClusters@2024-10-01' = {
  name: clusterName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${clusterIdentity.id}': {} }
  }
  dependsOn: [networkAccess]
  sku: { name: 'Base', tier: 'Standard' }
  properties: {
    dnsPrefix: clusterName
    enableRBAC: true
    disableLocalAccounts: true
    aadProfile: {
      managed: true
      enableAzureRBAC: true
      tenantID: tenant().tenantId
    }
    apiServerAccessProfile: {
      enablePrivateCluster: privateCluster
      enablePrivateClusterPublicFQDN: false
    }
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        count: 3
        vmSize: nodeVmSize
        osType: 'Linux'
        osSKU: 'Ubuntu'
        type: 'VirtualMachineScaleSets'
        osDiskSizeGB: 64
        vnetSubnetID: '${network.id}/subnets/snet-aks'
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      podCidr: '10.244.0.0/16'
      serviceCidr: '10.0.0.0/16'
      dnsServiceIP: '10.0.0.10'
      loadBalancerSku: 'standard'
      outboundType: 'loadBalancer'
    }
    addonProfiles: {
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceID: workspace.id
          useAADAuth: 'true'
        }
      }
    }
    autoUpgradeProfile: {
      upgradeChannel: 'patch'
      nodeOSUpgradeChannel: 'NodeImage'
    }
  }
}

resource pullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, cluster.id, 'kubelet-acr-pull')
  scope: registry
  properties: {
    principalId: cluster.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource deployerAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cluster.id, deployerObjectId, 'deployment-owner')
  scope: cluster
  properties: {
    principalId: deployerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b')
  }
}

resource containerLogs 'Microsoft.Insights/dataCollectionRules@2023-03-11' = {
  name: 'dcr-${clusterName}'
  location: location
  kind: 'Linux'
  properties: {
    dataSources: {
      extensions: [
        {
          name: 'ContainerInsightsExtension'
          extensionName: 'ContainerInsights'
          streams: ['Microsoft-ContainerInsights-Group-Default']
          extensionSettings: {
            dataCollectionSettings: {
              interval: '1m'
              namespaceFilteringMode: 'Off'
              enableContainerLogV2: true
            }
          }
        }
      ]
    }
    destinations: {
      logAnalytics: [
        { name: 'paymentLogs', workspaceResourceId: workspace.id }
      ]
    }
    dataFlows: [
      {
        streams: ['Microsoft-ContainerInsights-Group-Default']
        destinations: ['paymentLogs']
      }
    ]
  }
}

resource logAssociation 'Microsoft.Insights/dataCollectionRuleAssociations@2023-03-11' = {
  name: 'container-insights'
  scope: cluster
  properties: { dataCollectionRuleId: containerLogs.id }
}

resource logPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerLogs.id, cluster.id, 'monitoring-publisher')
  scope: containerLogs
  properties: {
    principalId: cluster.properties.addonProfiles.omsagent.identity.objectId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb')
  }
}

output clusterResourceId string = cluster.id
output registryResourceId string = registry.id
output registryLoginServer string = registry.properties.loginServer
output insightsResourceId string = insights.id
output workspaceResourceId string = workspace.id
output agentSubnetResourceId string = '${network.id}/subnets/snet-agent'
output dataCollectionRuleResourceId string = containerLogs.id
