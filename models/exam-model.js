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
    totalPoints: {
        type: Number
    },
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
    autoMarking:{
        type: Boolean,
    },
    // school: {
    //     type: String | Number | null,
    // },
}, {
    timestamps: true
})

module.exports = mongoose.model('examModel', examSchema);
