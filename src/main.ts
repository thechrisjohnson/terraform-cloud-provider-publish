import * as fs from 'fs/promises'
import * as path from 'path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {TerraformClient, TerraformManifestFile} from './terraform'

const zip = '.zip'

async function run(): Promise<void> {
  try {
    // Load configuration
    const organizationName: string = core.getInput('organization-name')
    const organizationKey: string = core.getInput('organization-key')
    const providerDirName: string = core.getInput('provider-directory')
    const gpgKey: string = core.getInput('gpg-key')

    // Figure out the path for the provider
    let githubWorkspacePath = process.env['GITHUB_WORKSPACE']
    if (!githubWorkspacePath) {
      throw new Error('$GITHUB_WORKSPACE not defined')
    }
    githubWorkspacePath = path.resolve(githubWorkspacePath)
    const providerDir = path.resolve(githubWorkspacePath, providerDirName)

    // Create the terraform client
    const tfClient = new TerraformClient(organizationName, organizationKey)

    // Find the *manifest.json file, and calculate the required values from there
    const providerFiles = await fs.readdir(providerDir)
    const manifestFile = providerFiles.find(value =>
      value.endsWith('manifest.json')
    )
    if (manifestFile === undefined) {
      throw new Error(`Unable to find manifest file in ${providerDir}`)
    }

    const parts = manifestFile.split('_')
    if (parts.length !== 3) {
      throw new Error(`Invalid manifest file ${manifestFile}`)
    }

    const providerName = parts[0]
    const providerVersion = parts[1]

    // Read the last bit of information from the manifest file
    const manifestRaw = await fs.readFile(path.join(providerDir, manifestFile))
    const manifest: TerraformManifestFile = JSON.parse(manifestRaw.toString())
    const providerProtocols = manifest.metadata.protocol_versions

    // Now that we have the values we need, create everything
    core.info(
      `Checking to see if provider ${organizationName}/${providerName} already exists...`
    )
    let provider = await tfClient.getProvider(providerName)
    if (provider == null) {
      core.info(
        `Provider did not exist, creating ${organizationName}/${providerName}...`
      )
      provider = await tfClient.postProvider(providerName)
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
    let version = await tfClient.getProviderVersion(
      providerName,
      providerVersion
    )
    if (version == null) {
      core.info(`Creating new provider version ${providerVersion}`)
      version = await tfClient.postProviderVersion(
        providerName,
        providerVersion,
        providerProtocols,
        signingKey.id
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
    if (version.attributes['shasums-uploaded'] === false) {
      await uploadFile(version.links['shasums-upload'], sumFile)
    }

    core.info(`Checking if we need to upload sig file...`)
    if (version.attributes['shasums-sig-uploaded'] === false) {
      await uploadFile(version.links['shasums-sig-upload'], signatureFile)
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

      const fileParts = file.split('_')
      if (
        fileParts.length !== 4 ||
        fileParts[0] !== providerName ||
        fileParts[1] !== providerVersion
      ) {
        core.info(`Skipping file ${file}`)
        continue
      }

      const os = fileParts[2]
      let arch = fileParts[3]
      if (arch.endsWith(zip)) {
        arch = arch.substring(0, arch.length - zip.length)
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
