const mongoose = require('mongoose');

const examSchema = mongoose.Schema({
    id:{
        type: String,
    },
    name:{
        type: String,
    },
    description:{
        type: String,
    },
    instructions:{
        type: String,
    },
    studentsEnrolled:[
        { type: String }
    ],
    studentsCompleted: [
        {
            email: { type: String },
            mark: {type: String, default: null}
        }
    ],
    totalPointsMin: { type: Number, default: 0 },
    totalPointsMax: { type: Number, default: 100 },
    description:{
        type: String,
    },
    questions: [
        { type: String }
    ],
    casualPrice:{
        type: Number,
    },
    default:{
        type: Boolean,
    },
    assignedTeacher:{
        type: String,
    },
    aiMarkingComplete:[
        {
            email: { type: String },
        }
    ],
    // school: {
    //     type: String | Number | null,
    // },
}, {
    timestamps: true
})

module.exports = mongoose.model('examModel', examSchema);
