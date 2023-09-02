const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, //referring to our .env file for the details to our cloudinary account
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary,
    params:{
        folder:"Class E", // this will be the name of the folder you store for this app on cloudinary 
        allowedFormats:['jpeg','png','jpg']
    }
});

module.exports = {
    cloudinary,
    storage
}