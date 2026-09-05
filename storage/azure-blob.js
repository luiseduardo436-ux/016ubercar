const fs = require('node:fs');
const path = require('node:path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'driver-documents';
const enabled = process.env.STORAGE_PROVIDER === 'azure-blob' && Boolean(accountName);
const client = enabled ? new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, new DefaultAzureCredential()) : null;

async function uploadDocument(relativePath, contentType) {
  if (!enabled) return { provider: 'local', path: relativePath };
  const localPath = path.join(__dirname, '..', relativePath);
  const blobName = path.basename(relativePath);
  const container = client.getContainerClient(containerName);
  const blob = container.getBlockBlobClient(blobName);
  await blob.uploadFile(localPath, { blobHTTPHeaders: { blobContentType: contentType || 'application/octet-stream' } });
  await fs.promises.unlink(localPath);
  return { provider: 'azure-blob', path: blobName, url: blob.url };
}

module.exports = { enabled, uploadDocument };
