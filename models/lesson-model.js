const mongoose = require('mongoose');

const lessonSchema = mongoose.Schema({
    id:{
        type: String,
    },
    name:{
        type: String,
    },
    schoolId:{
        type: String,
    },
    description:{
        type: String,
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
        type:Number
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
