const mongoose = require('mongoose');

const homeworkSchema = mongoose.Schema({
    name:{
        type: String,
    },
    description:{
        type: String,
    },
    dueDate:{
        type: String,
    },
    assignedTeacher:{
        type: String,
    },
    students:[
        { type: String }
    ],
    duration:{
        type: Number,
    },
    attachment: {
        url:String,
        filename:String
    },
    schoolId:{
        type: String,
    },
    comments:[
        {
            teacher: String,
            student: String,
            date: String,
            duration: Number,
            commentType: String, // 'feedback' | 'submission',
            text: String,
            attachement: {
                url:String,
                fileName:String
            },
            pass: Boolean,
        }
    ],
}, {
    timestamps: true
})

module.exports = mongoose.model('homeworkModel', homeworkSchema);

  