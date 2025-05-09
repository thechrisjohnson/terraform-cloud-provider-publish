import * as fs from 'fs/promises'
import * as path from 'path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {
  TerraformClient,
  TerraformManifestFile,
  TerraformMetadataFile
} from './terraform'

const providerPrefix = 'terraform-provider-'
const fileRegex =
  /^(?<provider>[a-zA-Z0-9-]+)_(?<version>[a-zA-Z0-9-.]+)_(?<os>[a-zA-Z0-9-]+)_(?<arch>[a-zA-Z0-9-]+)\.(?<extension>[a-zA-Z0-9-.]+)$/

async function run(): Promise<void> {
  try {
    // Load configuration
    const organizationName: string = core.getInput('organization-name')
    const organizationKey: string = core.getInput('organization-api-token')
    const providerDirName: string = core.getInput('provider-directory')
    const gpgKey: string = core.getInput('gpg-key')

    // Figure out the path for the provider
    let repositoryRootDir = process.env['GITHUB_WORKSPACE']
    if (!repositoryRootDir) {
      throw new Error('$GITHUB_WORKSPACE not defined')
    }
    repositoryRootDir = path.resolve(repositoryRootDir)
    const providerDir = path.resolve(repositoryRootDir, providerDirName)

    // Create the terraform client
    const tfClient = new TerraformClient(organizationName, organizationKey)

    // Find the *manifest.json file if we can, and calculate the required values from there
    let providerName: string
    let providerVersion: string
    let providerProtocols: string[]

    const providerFiles = await fs.readdir(providerDir)
    const manifestFile = providerFiles.find(value =>
      value.endsWith('manifest.json')
    )

    if (manifestFile === undefined) {
      // We couldn't locate the manifest file to base this on
      // Try looking for a metadata.json file
      const metadataFile = providerFiles.find(
        value => value === 'metadata.json'
      )

      if (metadataFile === undefined) {
        throw new Error(
          `Unable to find manifest or metadata file in ${providerDir}`
        )
      }

      const metadataRaw = await fs.readFile(
        path.join(providerDir, metadataFile)
      )
      const metadata: TerraformMetadataFile = JSON.parse(metadataRaw.toString())

      if (!metadata.project_name.startsWith(providerPrefix)) {
        throw new Error(`Invalid provider file names ${metadata.project_name}`)
      }

      providerName = metadata.project_name.substring(providerPrefix.length)
      providerVersion = metadata.version

      const repositoryRootFiles = await fs.readdir(repositoryRootDir)
      const registryManifestFile = repositoryRootFiles.find(
        value => value === 'terraform-registry-manifest.json'
      )

      if (registryManifestFile === undefined) {
        throw new Error(
          `Unable to find terraform-registry-manifest.json file in ${repositoryRootDir}`
        )
      }

      const manifestRaw = await fs.readFile(
        path.join(repositoryRootDir, registryManifestFile)
      )
      const manifest: TerraformManifestFile = JSON.parse(manifestRaw.toString())

      providerProtocols = manifest.metadata.protocol_versions
    } else {
      const parts = manifestFile.split('_')
      if (parts.length !== 3) {
        throw new Error(`Invalid manifest file ${manifestFile}`)
      }

      if (!parts[0].startsWith(providerPrefix)) {
        throw new Error(`Invalid provider file names ${parts[0]}`)
      }

      providerName = parts[0].substring(providerPrefix.length)
      providerVersion = parts[1]

      // Read the last bit of information from the manifest file
      const manifestRaw = await fs.readFile(
        path.join(providerDir, manifestFile)
      )
      const manifest: TerraformManifestFile = JSON.parse(manifestRaw.toString())
      providerProtocols = manifest.metadata.protocol_versions
    }

    // Now that we have the values we need, create everything
    core.info(
      `Checking to see if provider ${organizationName}/${providerName} already exists...`
    )
    let tfProvider = await tfClient.getProvider(providerName)
    if (tfProvider == null) {
      core.info(
        `Provider did not exist, creating ${organizationName}/${providerName}...`
      )
      tfProvider = await tfClient.postProvider(providerName)
    }

    core.info(`Checking to see if gpg key exists...`)
    const existingKeys = await tfClient.getAllSigningKeys()
    let signingKey = existingKeys.data?.find(
      key => key.attributes['ascii-armor'] === gpgKey
    )
    if (signingKey == null) {
      core.info(`Gpg key does not exist, creating...`)
      signingKey = await tfClient.postSingingKey(gpgKey)
    }

    core.info(
      `Checking to see if provider version ${providerVersion} exists...`
    )
    let tfVersion = await tfClient.getProviderVersion(
      providerName,
      providerVersion
    )
    if (tfVersion == null) {
      core.info(`Creating new provider version ${providerVersion}`)
      tfVersion = await tfClient.postProviderVersion(
        providerName,
        providerVersion,
        providerProtocols,
        signingKey.attributes['key-id']
      )
    }

    // Take the output folder for all of the files and look for a SHA256SUM and SHA256SUM.sig
    const sumFileBase = providerFiles.find(value =>
      value.endsWith('SHA256SUMS')
    )
    const signatureFileBase = providerFiles.find(value =>
      value.endsWith('SHA256SUMS.sig')
    )
    if (sumFileBase === undefined || signatureFileBase === undefined) {
      throw new Error('Unable to find sum file and/or signature file')
    }

    const sumFile = path.join(providerDir, sumFileBase)
    const signatureFile = path.join(providerDir, signatureFileBase)

    // If we need to upload the signature or sum files, do that
    core.info(`Checking if we need to upload sha256 file...`)
    if (tfVersion.attributes['shasums-uploaded'] === false) {
      await uploadFile(tfVersion.links['shasums-upload'], sumFile)
    }

    core.info(`Checking if we need to upload sig file...`)
    if (tfVersion.attributes['shasums-sig-uploaded'] === false) {
      await uploadFile(tfVersion.links['shasums-sig-upload'], signatureFile)
    }

    // Read the shasums file and upload platforms based on that
    const platformsBuffer = await fs.readFile(sumFile)
    const platforms = platformsBuffer.toString()
    for (const line of platforms.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === undefined || trimmed === '') {
        core.info('Skipping empty line')
        continue
      }

      const lineParts = trimmed.split(' ').filter(word => word.trim() !== '')
      if (lineParts.length !== 2) {
        core.info(`Skipping line ${line}`)
        continue
      }

      const shasum = lineParts[0]
      const file = lineParts[1]

      const match = fileRegex.exec(file)
      if (match === null) {
        core.info(`Skipping file ${file}, did not match regex ${fileRegex}`)
        continue
      }

      const {provider, version, os, arch, extension} = match?.groups as {
        readonly provider: string
        readonly version: string
        readonly os: string
        readonly arch: string
        readonly extension: string
      }
      if (
        provider !== providerPrefix.concat(providerName) ||
        version !== providerVersion ||
        extension !== 'zip'
      ) {
        core.info(`Skipping file ${file}`)
        continue
      }

      core.info(
        `Checking to see if platform ${os}_${arch} for ${providerName} ${providerVersion} already exists`
      )
      const existingPlatforms = await tfClient.getAllProviderPlatforms(
        providerName,
        providerVersion
      )

      let platform = existingPlatforms.data?.find(
        plat => plat.attributes.os === os && plat.attributes.arch === arch
      )
      if (platform == null) {
        core.info(
          `Creating platform ${os}_${arch} for ${providerName} ${providerVersion}`
        )
        platform = await tfClient.postProviderPlatform(
          providerName,
          providerVersion,
          os,
          arch,
          shasum,
          file
        )
      }

      if (platform.attributes['provider-binary-uploaded'] === true) {
        core.info(`File ${file} already uploaded`)
      } else {
        await uploadFile(
          platform.links['provider-binary-upload'],
          path.join(providerDir, file)
        )
      }
    }

    core.info(`Successfully published ${providerName} ${providerVersion}`)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function uploadFile(url: string, filePath: string): Promise<void> {
  let error = ''
  const options = {
    listeners: {
      stderr: (data: Buffer) => {
        error += data.toString()
      }
    }
  }

  // This is just laziness, as I didn't want to write a multipart uploader using basic node
  core.info(`Uploading file: ${filePath}`)
  await exec.exec('curl', ['-s', '-S', '-T', filePath, url], options)

  if (error !== '') {
    throw new Error(error)
  }
}

run()
