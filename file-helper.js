const cloudinary = require('cloudinary').v2;

/**
 * Checks whether a folder has at least one uploaded resource
 * @param {string} folderPath
 * @returns {boolean}
 */
async function cloudinaryFolderHasResources(folderPath) {
  const { resources } = await cloudinary.api.resources({
    type: "upload",
    prefix: folderPath,
    max_results: 1
  });

  return resources?.length > 0;
}

/**
 * Deletes all resources inside a folder AND the folder itself
 * @param {string} folderPath
 */
async function deleteCloudinaryFolder(folderPath) {
  await cloudinary.api.delete_resources_by_prefix(folderPath);
  await cloudinary.api.delete_folder(folderPath);
}

/**
 * Checks if folder has resources and deletes it if it does
 * @param {string} folderPath
 */
async function deleteCloudinaryFolderIfExists(folderPath) {
  const exists = await cloudinaryFolderHasResources(folderPath);

  if (exists) {
    await deleteCloudinaryFolder(folderPath);
  }
}

/**
 * Helper function to delete file
 */
async function deleteFile (fileName) {
  if (fileName) {
    cloudinary.uploader.destroy(fileName, (err, result) => {
      if (err) console.log('Error deleting file:', err);
    });
  }
};


module.exports = {
  cloudinaryFolderHasResources,
  deleteCloudinaryFolder,
  deleteCloudinaryFolderIfExists,
  deleteFile  
};
