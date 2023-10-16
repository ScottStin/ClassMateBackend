const mongoose = require('mongoose');

const lessonTypeSchema = mongoose.Schema({
    name:{
        type: String,
    },
    shortName:{
        type: String,
    },
})

module.exports = mongoose.model('lessonTypeModel', lessonTypeSchema);
