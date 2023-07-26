import {HttpClient} from '@actions/http-client'
import {BearerCredentialHandler} from '@actions/http-client/lib/auth'

function GenerateGetProviderUrl(
  organizationName: string,
  providerName: string
): string {
  return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers/private/${organizationName}/${providerName}`
}

function GeneratePostProviderUrl(organizationName: string): string {
  return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers`
}

function GenerateGetGpgKeysUrl(organizationName: string): string {
  return `https://app.terraform.io/api/registry/private/v2/gpg-keys?filter[namespace]=${organizationName}`
}

function GeneratePostProviderVersionUrl(
  organizationName: string,
  providerName: string
): string {
  return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers/private/${organizationName}/${providerName}/versions`
}

function GeneratePostProviderPlatformUrl(
  organizationName: string,
  providerName: string,
  version: string
): string {
  return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers/private/${organizationName}/${providerName}/versions/${version}/platforms`
}

export class TerraformClient {
  organizationName: string
  httpClient: HttpClient

  constructor(organizationName: string, organizationKey: string) {
    this.organizationName = organizationName
    this.httpClient = new HttpClient(
      'Publish Private Provider Action',
      [new BearerCredentialHandler(organizationKey)],
      {headers: {'Content-Type': 'application/vnd.api+json'}}
    )
  }

  async getProvider(providerName: string): Promise<TerraformProvider | null> {
    const response = await this.httpClient.getJson<
      DataWrappedValue<TerraformProvider>
    >(GenerateGetProviderUrl(this.organizationName, providerName))

    return response.result?.data ?? null
  }

  async postProvider(providerName: string): Promise<TerraformProvider> {
    const body = {
      data: {
        type: 'registry-providers',
        attributes: {
          name: providerName,
          namespace: this.organizationName,
          'registry-name': 'private'
        }
      }
    }

    const response = await this.httpClient.postJson<
      DataWrappedValue<TerraformProvider>
    >(GeneratePostProviderUrl(this.organizationName), body)
    if (response.result == null) {
      throw new Error(`Invalid reponse code: ${response.statusCode}`)
    }

    return response.result.data
  }

  async getAllSigningKeys(): Promise<TerraformSigningKeyList | null> {
    const response = await this.httpClient.getJson<TerraformSigningKeyList>(
      GenerateGetGpgKeysUrl(this.organizationName)
    )

    return response.result
  }

  async postSingingKey(asciiArmor: string): Promise<TerraformSigningKey> {
    const body = {
      data: {
        type: 'gpg-keys',
        attributes: {
          namespace: this.organizationName,
          'ascii-armor': asciiArmor
        }
      }
    }

    const response = await this.httpClient.postJson<
      DataWrappedValue<TerraformSigningKey>
    >('https://app.terraform.io/api/registry/private/v2/gpg-keys', body)
    if (response.result == null) {
      throw new Error(`Invalid response code: ${response.statusCode}`)
    }

    return response.result.data
  }

  async postProviderVersion(
    providerName: string,
    version: string,
    supportedProtocols: string[],
    keyId: string
  ): Promise<TerraformProviderVersion> {
    const body = {
      data: {
        type: 'registry-provider-versions',
        attributes: {
          version,
          'key-id': keyId,
          protocols: supportedProtocols
        }
      }
    }

    const response = await this.httpClient.postJson<
      DataWrappedValue<TerraformProviderVersion>
    >(GeneratePostProviderVersionUrl(this.organizationName, providerName), body)
    if (response.result == null) {
      throw new Error(`Invalid response code: ${response.statusCode}`)
    }

    return response.result.data
  }

  async postProviderPlatform(
    providerName: string,
    version: string,
    os: string,
    arch: string,
    shasum: string,
    filename: string
  ): Promise<TerraformProviderPlatform> {
    const body = {
      data: {
        type: 'registry-provider-version-platforms',
        attributes: {
          os,
          arch,
          shasum,
          filename
        }
      }
    }

    const response = await this.httpClient.postJson<
      DataWrappedValue<TerraformProviderPlatform>
    >(
      GeneratePostProviderPlatformUrl(
        this.organizationName,
        providerName,
        version
      ),
      body
    )
    if (response.result == null) {
      throw new Error(`Invalid response code: ${response.statusCode}`)
    }

    return response.result.data
  }
}

export interface DataWrappedValue<T> {
  data: T
}

export interface TerraformProvider {
  id: string
  type: string
  attributes: TerraformProviderAttributes
  relationships: TerraformProviderRelationships
  links: TerraformLinks
}

export interface TerraformProviderAttributes {
  name: string
  namespace: string
  'registry-name': string
  'created-at': string
  'updated-at': string
  permissions: TerraformProviderPermissions
}

export interface TerraformProviderPermissions {
  'can-delete': boolean
  'can-upload-asset': boolean | undefined
}

export interface TerraformProviderRelationships {
  versions: TerraformProviderVersions
}

export interface TerraformProviderVersions {
  data: TerraformProviderVersions[]
}

export interface TerraformProviderVersionReference {
  id: string
  type: string
}

export interface TerraformLinks {
  self: string
}

export interface TerraformSigningKey {
  type: string
  id: string
  attributes: TerraformSigningKeyAttributes
  links: TerraformLinks
}

export interface TerraformSigningKeyAttributes {
  'ascii-armor': string
  'created-at': string
  'key-id': string
  namespace: string
  source: string
  'source-url': string
  'trust-signature': string
  'updated-at': string
}

export interface TerraformSigningKeyList {
  data: TerraformSigningKey[]
  links: TerraformSigningKeyListLinks
  meta: TerraformSigningKeyListMetadata
}

export interface TerraformSigningKeyListLinks {
  first: string
  last: string
  next: string
  prev: string
}

export interface TerraformSigningKeyListMetadata {
  pagination: TerraformSigningKeyListPagination
}

export interface TerraformSigningKeyListPagination {
  'page-size': number
  'current-page': number
  'next-page': number
  'prev-page': number
  'total-pages': number
  'total-count': number
}

export interface TerraformProviderVersion {
  id: string
  type: string
  attributes: TerraformProviderVersionAttributes
  links: TerraformProviderVersionLinks
}

export interface TerraformProviderVersionAttributes {
  version: string
  'created-at': string
  'updated-at': string
  'key-id': string
  protocols: string[]
  permissions: TerraformProviderPermissions
  'shasums-uploaded': boolean
  'shasums-sig-uploaded': boolean
}

export interface TerraformProviderVersionLinks {
  'shasums-upload': string
  'shasums-sig-upload': string
}

export interface TerraformProviderPlatform {
  id: string
  type: string
  attributes: TerraformProviderPlatformAttributes
  links: TerraformProviderPlatformLinks
}

export interface TerraformProviderPlatformAttributes {
  os: string
  arch: string
  shasum: string
  filename: string
  permissions: TerraformProviderPermissions
  'provider-binary-uploaded': boolean
}

export interface TerraformProviderPlatformLinks {
  'provider-binary-upload': string
}

export interface TerraformManifestFile {
  version: number
  metadata: TerraformManifestFileMetadata
}

export interface TerraformManifestFileMetadata {
  protocol_versions: string[]
}
