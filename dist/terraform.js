"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerraformClient = void 0;
const http_client_1 = require("@actions/http-client");
const auth_1 = require("@actions/http-client/lib/auth");
function GenerateGetProviderUrl(organizationName, providerName) {
    return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers/private/${organizationName}/${providerName}`;
}
function GeneratePostProviderUrl(organizationName) {
    return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers`;
}
function GenerateGetGpgKeysUrl(organizationName) {
    return `https://app.terraform.io/api/registry/private/v2/gpg-keys?filter[namespace]=${organizationName}`;
}
function GenerateGetProviderVersionUrl(organizationName, providerName, version) {
    return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers/private/${organizationName}/${providerName}/versions/${version}`;
}
function GeneratePostProviderVersionUrl(organizationName, providerName) {
    return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers/private/${organizationName}/${providerName}/versions`;
}
function GenerateProviderPlatformUrl(organizationName, providerName, version) {
    return `https://app.terraform.io/api/v2/organizations/${organizationName}/registry-providers/private/${organizationName}/${providerName}/versions/${version}/platforms`;
}
class TerraformClient {
    organizationName;
    httpClient;
    constructor(organizationName, organizationKey) {
        this.organizationName = organizationName;
        this.httpClient = new http_client_1.HttpClient('Publish Private Provider Action', [new auth_1.BearerCredentialHandler(organizationKey)], { headers: { 'Content-Type': 'application/vnd.api+json' } });
    }
    async getProvider(providerName) {
        const response = await this.httpClient.getJson(GenerateGetProviderUrl(this.organizationName, providerName));
        return response.result?.data ?? null;
    }
    async postProvider(providerName) {
        const body = {
            data: {
                type: 'registry-providers',
                attributes: {
                    name: providerName,
                    namespace: this.organizationName,
                    'registry-name': 'private'
                }
            }
        };
        const response = await this.httpClient.postJson(GeneratePostProviderUrl(this.organizationName), body);
        if (response.result == null) {
            throw new Error(`Invalid response code: ${response.statusCode}`);
        }
        return response.result.data;
    }
    async getAllSigningKeys() {
        const response = await this.httpClient.getJson(GenerateGetGpgKeysUrl(this.organizationName));
        if (response.result == null) {
            throw new Error(`Invalid response code: ${response.statusCode}`);
        }
        return response.result;
    }
    async postSingingKey(asciiArmor) {
        const body = {
            data: {
                type: 'gpg-keys',
                attributes: {
                    namespace: this.organizationName,
                    'ascii-armor': asciiArmor
                }
            }
        };
        const response = await this.httpClient.postJson('https://app.terraform.io/api/registry/private/v2/gpg-keys', body);
        if (response.result == null) {
            throw new Error(`Invalid response code: ${response.statusCode}`);
        }
        return response.result.data;
    }
    async getProviderVersion(providerName, version) {
        const response = await this.httpClient.getJson(GenerateGetProviderVersionUrl(this.organizationName, providerName, version));
        return response.result?.data ?? null;
    }
    async postProviderVersion(providerName, version, supportedProtocols, keyId) {
        const body = {
            data: {
                type: 'registry-provider-versions',
                attributes: {
                    version,
                    'key-id': keyId,
                    protocols: supportedProtocols
                }
            }
        };
        const response = await this.httpClient.postJson(GeneratePostProviderVersionUrl(this.organizationName, providerName), body);
        if (response.result == null) {
            throw new Error(`Invalid response code: ${response.statusCode}`);
        }
        return response.result.data;
    }
    async getAllProviderPlatforms(providerName, version) {
        const response = await this.httpClient.getJson(GenerateProviderPlatformUrl(this.organizationName, providerName, version));
        if (response.result == null) {
            throw new Error(`Invalid response code: ${response.statusCode}`);
        }
        return response.result;
    }
    async postProviderPlatform(providerName, version, os, arch, shasum, filename) {
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
        };
        const response = await this.httpClient.postJson(GenerateProviderPlatformUrl(this.organizationName, providerName, version), body);
        if (response.result == null) {
            throw new Error(`Invalid response code: ${response.statusCode}`);
        }
        return response.result.data;
    }
}
exports.TerraformClient = TerraformClient;
