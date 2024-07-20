const mongoose = require('mongoose');

const homeworkSchema = mongoose.Schema({
    id:{
        type: String,
    },
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
        {
            studentId:String,
            completed:Boolean
        },
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
    attempts:{
        type: Number,
    },
    // completed:{
    //     type: Boolean,
    // },
    comments:[
        {
            id: String,
            teacher: String,
            student: String,
            date: String,
            duration: Number,
            commentType: String, // 'feedback' | 'submission',
            text: String,
            attachment: {
                url:String,
                fileName:String
            },
            pass: Boolean,
            createdAt: {
                type: Date,
                default: Date.now
            },
        },
    ],
}, {
    timestamps: true
})

module.exports = mongoose.model('homeworkModel', homeworkSchema);

  