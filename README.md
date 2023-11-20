<p align="center">
  <a href="https://github.com/thechrisjohnson/terraform-cloud-provider-publish/actions"><img alt="terraform-cloud-provider-publish status" src="https://github.com/thechrisjohnson/terraform-cloud-provider-publish/workflows/build-test/badge.svg"></a>
</p>

# Publish a terraform provider to a private registry

Use this action to publish a terraform provider to a terraform cloud private registry:rocket:

## Using the action

This action was designed to be used in conjuction with the example terraform code for 

An example use of the action:
```
-
    name: Publish provider
    uses: thechrisjohnson/terraform-cloud-provider-publish@9c741f7c267fd8c1049089dbcc788eb83a1b0b69 # v1.3
    with:
        organization-name: terraform-organization
        organization-api-token: ${{ secrets.TF_CLOUD_TOKEN }}
        provider-directory: dist
        gpg-key: ${{ secrets.GPG_PUBLIC_KEY }}
``` 

### Inputs
#### organization-name
The name of the organization in terraform cloud

#### organization-api-token
Terraform cloud API Token with permission to publish providers to the organization 

#### provider-directory
The directory that contains all of the files neccessary to publish a provider.
This is based on the recommended [go releaser file](https://github.com/hashicorp/terraform-provider-scaffolding-framework/blob/main/.goreleaser.yml) from terraform

#### gpg-key
The public key used to sign the files in the provider-directory in ascii armor format

## Developing the action

### Code in Main

> First, you'll need to have a reasonably modern version of `node` handy. This won't work with versions older than 9, for instance.

Install the dependencies  
```bash
$ npm install
```

Build the typescript and package it for distribution
```bash
$ npm run build && npm run package
```

Run the tests :heavy_check_mark:  
```bash
$ npm test

 PASS  ./index.test.js
  ✓ throws invalid number (3ms)
  ✓ wait 500 ms (504ms)
  ✓ test runs (95ms)

...
```

### Change the Code

Most toolkit and CI/CD operations involve async operations so the action is run in an async function.

```javascript
import * as core from '@actions/core';
...

async function run() {
  try { 
      ...
  } 
  catch (error) {
    core.setFailed(error.message);
  }
}

run()
```

See the [toolkit documentation](https://github.com/actions/toolkit/blob/master/README.md#packages) for the various packages.

