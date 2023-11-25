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
    studentsEnrolled:[
        { type: String }
    ],
    studentsCompleted:[
        { type: String }
    ],
    description:{
        type: String,
    },
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
}, {
    timestamps: true
})

module.exports = mongoose.model('examModel', examSchema);
