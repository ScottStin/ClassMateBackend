const mongoose = require('mongoose');

const lessonSchema = mongoose.Schema({
    id:{
        type: String,
    },
    name:{
        type: String,
        required: true,
        maxlength: 50,
    },
    schoolId:{
        type: String,
    },
    description:{
        type: String,
        maxlength: 250,
    },
    level: {
        type: Array,
        // enum: ['A1 Beginner','A2 Lower-Intermediate','B1 Intermediate','B2 Upper-Intermediate','C1 Advanced','C2 Native']
        // required: true,
    },
    type: {
        name: String,
        shortName: String,
    },
    duration: {
        type: Number,
        min: 1, 
        max: 999,
    },
    teacherId: {
        type:String,
    },
    maxStudents: {
        type: Number,
        required: true,
    },
    startDate: {
        type: String,
    },
    startTime: {
        type: String,
        required:true,
    },
    lessontimeZone: {
        type: String,       
    },
    studentsEnrolledIds:[
        { type: String }
    ],
    lessonStudentsAttended: [
        {type: String,}
    ],
    casualPrice:{
        type:Number,
        min: 0, 
        max: 1000,
    },
    status:{
        type:String // started, finished
    },
    restricted:{
        type:Boolean
    },
    disableFirstLesson:{
        type:Boolean
    }
}, {
    timestamps: true
})

module.exports = mongoose.model('lessonModel', lessonSchema);
