const express = require("express");
const router = express.Router();
const { cloudinary, storage } = require('../cloudinary');
const { getIo } = require('../socket-io');

const {questionModel, questionSubmissionModel} = require("../models/question-model");
const { examModel, examCompletionModel, examEnrollmentModel } = require("../models/exam-model");
const { courseworkModel } = require("../models/coursework-model.js");
const userModel = require("../models/user-models");
const { createStudentStat } = require('./StudentStatsRoutes.js');

/**
 * Get all exam questions
 */

router.get('/', async function (req, res) {
  try {
    // 1. Extract parameters from the query string
    const { examId, userId, userType } = req.query;

    let filter = {};
    if (examId) {
      // Clean up the 'undefined || null' evaluation to match top-level documents safely
      filter = { examId: examId, parent: null };
    }

    // 2. Fetch questions with populated sub-questions as plain editable JS objects (.lean())
    const questions = await questionModel.find(filter)
      .populate('subQuestions')
      .lean() 
      .exec();

    // If there's no examId or role context, pass the raw questions right through
    if (!examId || !userType) {
      return res.json(questions);
    }

    // 3. Fetch relevant submissions from our separate collection based on user role
    let submissions = [];
    if (userType.toLowerCase() === 'student' && userId) {
      // Students only get to see their own answers
      submissions = await questionSubmissionModel.find({ examId, studentId: userId }).lean();
    } else {
      // Teachers get to see all student answers for marking
      submissions = await questionSubmissionModel.find({ examId }).lean();
    }

    // 4. Map submissions into a Map for ultra-fast O(1) lookups during nesting loops
    const submissionMap = new Map();
    
    if (userType.toLowerCase() !== 'student') {
      // Teachers need an array of submissions grouped per question ID
      submissions.forEach(sub => {
        const qId = sub.questionId.toString();
        if (!submissionMap.has(qId)) submissionMap.set(qId, []);
        submissionMap.get(qId).push(sub);
      });
    } else {
      // Students only have a single submission object per question ID
      submissions.forEach(sub => {
        submissionMap.set(sub.questionId.toString(), sub);
      });
    }

    // 5. Recursive function to handle deep-nesting arrays within 'subQuestions'
    const stitchQuestionData = (question) => {
      const qId = question._id.toString();

      if (userType.toLowerCase() !== 'student') {
        const questionSubs = submissionMap.get(qId) || [];
        
        question.studentResponse = questionSubs.map(sub => ({
          studentId: sub.studentId,
          response: sub.response,
          mark: sub.mark,
          feedback: sub.feedback
        }));

        question.studentsCompleted = questionSubs.map(sub => ({
          studentId: sub.studentId,
          dateComplete: sub.dateComplete
        }));
      } else {
        // Handle student fallback layout maps
        const userSub = submissionMap.get(qId);
        
        question.studentResponse = userSub ? [{
          studentId: userSub.studentId,
          response: userSub.response,
          mark: userSub.mark,
          feedback: userSub.feedback
        }] : [];

        question.studentsCompleted = userSub ? [{
          studentId: userSub.studentId,
          dateComplete: userSub.dateComplete
        }] : [];
      }

      // Run recursively so sub-questions get their responses stitched too
      if (question.subQuestions && question.subQuestions.length > 0) {
        question.subQuestions.forEach(subQuestion => stitchQuestionData(subQuestion));
      }
    };

    // 6. Execute the stitcher across all top-level questions found
    questions.forEach(question => stitchQuestionData(question));

    // Return the perfectly formatted array back to  frontend
    return res.json(questions);

  } catch (error) {
    console.error("Error getting questions:", error);
    return res.status(500).send("Internal Server Error");
  }
});

/**
 * Create Question
 */

async function createQuestion(question, examId, schoolId) {
    const { subQuestions, id, ...questionData } = question;
      questionData.examId = examId; // note - we're using examId for courses as well, not just exams

      // --- upload prompt to cloudinary and add to question (if prompt exists):
      if (questionData.prompt1?.fileString && questionData.prompt1?.type) {
        questionData.prompt1.fileString = await saveQuestionPrompt(questionData.prompt1.fileString, questionData.prompt1?.type, schoolId, examId)
      }
      if (questionData.prompt2?.fileString && questionData.prompt2?.type) {
        questionData.prompt2.fileString = await saveQuestionPrompt(questionData.prompt2.fileString, questionData.prompt2?.type, schoolId, examId)
      }
      if (questionData.prompt3?.fileString && questionData.prompt3?.type) {
        questionData.prompt3.fileString = await saveQuestionPrompt(questionData.prompt3.fileString, questionData.prompt3?.type, schoolId, examId)
      }
  
      // --- Create parent question:
      const createdQuestion = await questionModel.create(questionData);

      // --- check if question has sub questions, and if so, save them:
      if (subQuestions?.length > 0) {
        for (let subQuestion of subQuestions) {
          const { id, ...questionWithoutId } = subQuestion;
          const subQuestionData = {
            ...questionWithoutId,
            parent: createdQuestion.id,
            examId: examId, // Add examId (coursework id) to sub question
          };

        //   // --- Upload sub-question prompts if they exist:
          if (subQuestionData.prompt1?.fileString && subQuestionData.prompt1?.type) {
            subQuestionData.prompt1.fileString = await saveQuestionPrompt(
              subQuestionData.prompt1.fileString,
              subQuestionData.prompt1.type,
              schoolId,
              examId
            );
          }

          if (subQuestionData.prompt2?.fileString && subQuestionData.prompt2?.type) {
            subQuestionData.prompt2.fileString = await saveQuestionPrompt(
              subQuestionData.prompt2.fileString,
              subQuestionData.prompt2.type,
              schoolId,
              examId
            );
          }

          if (subQuestionData.prompt3?.fileString && subQuestionData.prompt3?.type) {
            subQuestionData.prompt3.fileString = await saveQuestionPrompt(
              subQuestionData.prompt3.fileString,
              subQuestionData.prompt3.type,
              schoolId,
              examId
            );
          }

          const createdSubQuestion = await questionModel.create(subQuestionData);
          createdQuestion.subQuestions.push(createdSubQuestion.id);
          await createdQuestion.save();
        }
      }
      return {questionId: createdQuestion.id, studentsCompleted: []};
}

/**
 * Delete Question
 */
async function deleteQuestion(question, examId, schoolId) {
  const targetQuestionId = question._id || question.questionId;

  // --- delete question document
  await questionModel.findByIdAndDelete(targetQuestionId);

  // delete all associated submissions to prevent orphaned documents
  await questionSubmissionModel.deleteMany({ questionId: targetQuestionId });

  // --- delete prompt assets
  const deleteAsset = async (fileString) => {
    if (!fileString) return;
    try {
      await cloudinary.uploader.destroy(fileString);
    } catch (err) {
      console.error(`Error deleting Cloudinary asset ${fileString}:`, err);
    }
  };

  await deleteAsset(question.prompt1?.fileString);
  await deleteAsset(question.prompt2?.fileString);
  await deleteAsset(question.prompt3?.fileString);
}

/**
 * Submit student's exam question responses
 */
router.patch('/submit-exam/:id', async function (req, res) {
  try {
    const studentId = req.body.currentUserId;
    const exam = await examModel.findById(req.params.id);
    const currentStudent = await userModel.findOne({ _id: studentId });

    if (!exam) {
      return res.status(404).json('Exam not found');
    }

    // Loop through and evaluate question submissions safely
    for (const questionId of exam.questions) {

      const stringifiedQuestionId = questionId.toString(); // Convert once at the top of the loop
      const foundQuestion = await questionModel.findById(questionId); // Mongoose can handle either, but ObjectId is fine here

      if (!foundQuestion) {
        return res.status(404).json('Question not found');
      }

      if (foundQuestion.type.toLowerCase() === 'section' && foundQuestion.subQuestions?.length > 0) {
        for (const subQuestionId of foundQuestion.subQuestions) {
          const foundSubQuestion = await questionModel.findById(subQuestionId);
          
          // Use stringifiedQuestionId and stringified subQuestionId
          const submittedSubQuestion = req.body.questions
            .find((obj) => obj['_id'] === stringifiedQuestionId)
            ?.subQuestions.find((obj) => obj['_id'] === subQuestionId.toString());
            
          const submittedSubQuestionStudentResponse = submittedSubQuestion?.studentResponse?.find((obj) => obj.studentId === studentId);

          await submitExamQuestion(submittedSubQuestionStudentResponse, currentStudent, exam, foundSubQuestion, submittedSubQuestion);
        }
      } else {
        //  Use stringifiedQuestionId
        const submittedQuestion = req.body.questions.find((obj) => obj['_id'] === stringifiedQuestionId);
        const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj) => obj.studentId === studentId);
        
        await submitExamQuestion(submittedStudentResponse, currentStudent, exam, foundQuestion, submittedQuestion);
      }
    }

    // Check decoupled tracking instead of embedded array
    const existingCompletion = await examCompletionModel.findOne({ examId: exam._id, studentId });
    if (existingCompletion) {
      return res.status(400).json('User has already completed this exam');
    }

    // Create standalone completion log entry
    await examCompletionModel.create({
      examId: exam._id,
      studentId: studentId,
      mark: null
    });

    res.status(200).json('Responses submitted successfully');

    // Add student stats tracking
    await createStudentStat({
      studentId: studentId,
      activityType: 'exam',
      minutes: 60,
      date: Date.now(),
      comment: `exam: ${exam.name}`,
      referenceId: exam._id,
    });

    // FRONTEND BRIDGE: Stitch collection records dynamically for socket payloads
    if (exam?.schoolId) {
      const examPayload = await populateExamWithEnrollment(exam._id);
      if(examPayload) {
        const io = getIo();
        io.emit('examEvent-' + exam.schoolId, { action: 'examUpdated', data: examPayload });
      }

    }
  } catch (error) {
    console.error("Error submitting responses:", error);
    res.status(500).send("Internal Server Error");
  }
});

  async function submitExamQuestion(submittedStudentResponse, currentStudent, exam, foundQuestion, submittedQuestion) {
    
    if(submittedStudentResponse){
        // -- If student response is an audio file, upload to cloudinary:
        if (['audio-response', 'repeat-sentence', 'read-outloud'].includes(foundQuestion.type.toLowerCase())) {
            const base64String = submittedStudentResponse.response;
        
            try {
                // Upload the Base64 string to Cloudinary with the correct resource type
                const result = await cloudinary.uploader.upload(base64String, {
                    folder: `${currentStudent.schoolId}/exam-question-responses/${exam._id}`,
                    resource_type: 'video' // Specify 'video' for audio files
                });
        
                // Update the response URL
                submittedStudentResponse.response = result.secure_url;
            } catch (err) {
                console.error("Cloudinary upload failed:", err);
            }
        }

        // -- If student's exam is a multi choice single answer, applying the marking immediately:
        if (['multiple-choice-single'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.multipleChoiceQuestionList) {
            const studentResponseMultiChoice = JSON.parse(submittedStudentResponse.response)[0];
            const correctAnswerId = foundQuestion.multipleChoiceQuestionList.find((option) => option.correct === true)._id.toString();
            
            if(correctAnswerId !== studentResponseMultiChoice) {
            submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin }
            } else {
            submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax }
            }
        }

        // -- If student's exam is a multi choice multi  answer, applying the marking immediately:
        if (['multiple-choice-multi'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.multipleChoiceQuestionList) {
            const studentResponsesMultiChoice = JSON.parse(submittedStudentResponse.response);
            const correctAnswerId = foundQuestion.multipleChoiceQuestionList.filter((option) => option.correct === true).map((answer) => answer._id);
            const correctAnswerIdStrings = correctAnswerId.map(id => id.toString());

            // if partial marking:
            if (submittedQuestion.partialMarking === true) {
            let rawStudentMark = 0;
            const rawTotalMark = correctAnswerIdStrings.length;

            studentResponsesMultiChoice.forEach(response => {
                if (correctAnswerIdStrings.includes(response)) {
                    rawStudentMark += 1; // for every response a student got correct, they given 1 point
                } else {
                    rawStudentMark -= 1; // for every response a student got incorrect, they lose a point
                }
            });

            // if student got zero or less points, give them the minimum score:
            if(rawStudentMark <= 0) {
                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin }
            } 

            // otherwise, give the student the correct adjusted score:
            else {
                submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
            }
            }
            // if  not partial marking, student must get all questions right to score:
            else {
            if(studentResponsesMultiChoice.length === correctAnswerIdStrings.length && studentResponsesMultiChoice.every((ans) => correctAnswerIdStrings.includes(ans))) {
                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax } // student got all answers correct
            } else {
                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin } // student did not get all answers correct
            }
            }
        }

        // -- If student's exam is a reorder sentence, applying the marking immediately:
        if (['reorder-sentence'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.reorderSentenceQuestionList) {
            const correctOrder = foundQuestion.reorderSentenceQuestionList.map((option) => option.text);
            const studentAnswerOrder = JSON.parse(submittedStudentResponse.response);

            // if partial marking, give the user points for each array item in the correct order:
            if (submittedQuestion.partialMarking === true) {
            if (correctOrder.length !== studentAnswerOrder.length) {
                throw new Error("Arrays must be of the same length.");
            }

            let rawStudentMark = 0;
            const rawTotalMark = correctOrder.length;

            for (let i = 0; i < correctOrder.length; i++) {
                if (correctOrder[i] === studentAnswerOrder[i]) {
                rawStudentMark++;
                }
            }
            submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
            }
            // if  not partial marking, student must get all questions right to score:
            else {
            if(JSON.stringify(correctOrder) === JSON.stringify(studentAnswerOrder)) {
                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax } // student got all answers corret
            } else {
                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin } // student did not get all answers correct
            }
            }
        }

        // -- If student's exam is a match option , applying the marking immediately:
        if (['match-options'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.matchOptionQuestionList) {  
            const studentAnswers = JSON.parse(submittedStudentResponse.response);

            // if partial marking, give the user points for each array item in the correct order:
            if (submittedQuestion.partialMarking === true) {

                let rawStudentMark = 0;
                const rawTotalMark = studentAnswers.length;

                for (const answer of studentAnswers) {
                    if (answer.leftOption.id === answer.rightOption.id) {
                        rawStudentMark++;
                    }
                }
                submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
            }
            // if  not partial marking, student must get all questions right to score:
            else {
                if(studentAnswers.every(item => item.leftOption.id === item.rightOption.id)) {
                    submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax } // student got all answers corret
                } else {
                    submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin } // student did not get all answers correct
                }
            }
        }

        // -- If student's exam is a fill-in-the-blanks, applying the marking immediately:
        if (['fill-in-the-blanks'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.fillBlanksQuestionList) {  
            let studentAnswers = JSON.parse(submittedStudentResponse.response).flat();
            let correctAnswers = foundQuestion.fillBlanksQuestionList.flatMap(item => item.blanks.map(blank => blank.text));
            const rawTotalMark = Math.min(studentAnswers.length, correctAnswers.length);
            
            if(!foundQuestion.caseSensitive) {
                studentAnswers = studentAnswers.map(ans => ans?.toLowerCase());
                correctAnswers = correctAnswers.map(ans => ans?.toLowerCase());
            }

            // if partial marking, give the user points for each correct blank:
            if (submittedQuestion.partialMarking === true) {

                let rawStudentMark = 0;

                for (let i = 0; i < rawTotalMark; i++) {
                const student = studentAnswers[i];
                const correct = correctAnswers[i];

                if (student && correct && correct.split('/').map(item => item.trim()).includes(student.trim())) {
                    rawStudentMark += 1;
                }
                }
                submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
            }
            // if  not partial marking, student must get all questions right to score:
            else {
                let allCorrect = true;

                for (let i = 0; i < rawTotalMark; i++) {
                    const student = studentAnswers[i];
                    const correct = correctAnswers[i];

                    const correctOptions = correct
                        ?.split('/')
                        .map(item => item.trim());

                    const isCorrect = student &&
                        correct &&
                        correctOptions?.some(option =>
                            foundQuestion.caseSensitive
                                ? option === student.trim()
                                : option.toLowerCase() === student.trim().toLowerCase()
                        );

                    if (!isCorrect) {
                        allCorrect = false;
                        break;
                    }
                }

                if (allCorrect) {
                    submittedStudentResponse.mark = {
                        totalMark: foundQuestion.totalPointsMax,
                    };
                } else {
                    submittedStudentResponse.mark = {
                        totalMark: foundQuestion.totalPointsMin,
                    };
                }
            }
        }

        // -- If student's exam is a fill-in-blanks-select, applying the marking immediately:
        if (['fill-in-blanks-select'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.fillBlanksQuestionList) {  
            let studentAnswers = JSON.parse(submittedStudentResponse.response).flat();
            let correctAnswers = foundQuestion.fillBlanksQuestionList.flatMap(item => item.blanks.map(blank => JSON.parse(blank.text)[blank.correctSelectOptionIndex]));
            
            const rawTotalMark = Math.min(studentAnswers.length, correctAnswers.length);

            // if partial marking, give the user points for each correct blank:
            if (submittedQuestion.partialMarking === true) {

                let rawStudentMark = 0;

                for (let i = 0; i < rawTotalMark; i++) {
                const student = studentAnswers[i];
                const correct = correctAnswers[i];

                if (student && correct && correct.split('/').map(item => item.trim()).includes(student.trim())) {
                    rawStudentMark += 1;
                }
                }
                submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
            }
            // if  not partial marking, student must get all questions right to score:
            else {
                let allCorrect = true;

                for (let i = 0; i < rawTotalMark; i++) {
                    const student = studentAnswers[i];
                    const correct = correctAnswers[i];

                    const correctOptions = correct
                        ?.split('/')
                        .map(item => item.trim());

                    const isCorrect = student &&
                        correct &&
                        correctOptions?.some(option =>
                            foundQuestion.caseSensitive
                                ? option === student.trim()
                                : option.toLowerCase() === student.trim().toLowerCase()
                        );

                    if (!isCorrect) {
                        allCorrect = false;
                        break;
                    }
                }

                if (allCorrect) {
                    submittedStudentResponse.mark = {
                        totalMark: foundQuestion.totalPointsMax,
                    };
                } else {
                    submittedStudentResponse.mark = {
                        totalMark: foundQuestion.totalPointsMin,
                    };
                }
            }
        }

        // -- StudentResponse:
        await questionSubmissionModel.findOneAndUpdate(
            { 
                questionId: foundQuestion._id, 
                studentId: currentStudent._id, 
                examId: exam._id 
            },
            { 
                $set: { 
                    response: submittedStudentResponse.response,
                    mark: submittedStudentResponse.mark
                } 
            },
            { upsert: true, new: true }
        );
    }
  };

/**
 * Submit teacher's feedback for student's exam question responses
 */
router.patch('/submit-feedback/:id', async function (req, res) {
  try {

    const teacherId = req.body.currentUserId;
    const studentId = req.body.studentId;
    const exam = await examModel.findById(req.params.id);
    
    if (!exam) {
      return res.status(404).json('Exam not found');
    }

    // Update marks and feedback details on specific question records
    for (const questionId of exam.questions) {
      const questionIdStr = questionId.toString();
      const foundQuestion = await questionModel.findById(questionId);
    
      if (!foundQuestion) {
        return res.status(404).json('Question not found');
      }

      if (foundQuestion.type.toLowerCase() === 'section' && foundQuestion.subQuestions?.length > 0) {

        for (const subQuestionId of foundQuestion.subQuestions) {

          const submittedSubQuestion = req.body.questions.find((obj) => obj['_id'] === questionId.toString()).subQuestions.find((obj) => obj['_id'] === subQuestionId.toString());
          const submittedSubQuestionStudentResponse = submittedSubQuestion?.studentResponse?.find((obj) => obj.studentId === studentId);

          if (submittedSubQuestionStudentResponse) {
            await questionSubmissionModel.findOneAndUpdate(
              { questionId: subQuestionId, studentId: studentId, examId: exam._id },
              {
                $set: {
                  ...(submittedSubQuestionStudentResponse.mark !== undefined && { 'mark': submittedSubQuestionStudentResponse.mark }),
                  ...(submittedSubQuestionStudentResponse.feedback !== undefined && { 'feedback': submittedSubQuestionStudentResponse.feedback })
                }
              },
              { upsert: true }
            );
          }
        }
      } else {
        const submittedQuestion = req.body.questions.find((obj) => obj['_id'] === questionId.toString());
        const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj) => obj.studentId === studentId);

        if (submittedStudentResponse) {
          await questionSubmissionModel.findOneAndUpdate(
            { questionId: foundQuestion._id, studentId: studentId, examId: exam._id },
            {
              $set: {
                ...(submittedStudentResponse.mark !== undefined && { 'mark': submittedStudentResponse.mark }),
                ...(submittedStudentResponse.feedback !== undefined && { 'feedback': submittedStudentResponse.feedback })
              }
            },
            { upsert: true }
          );
        }
      }
    }

    //  Update isolated tracking records instead of parent exam sub-arrays
    const updateFields = {};
    if (req.body.score !== undefined && req.body.score !== null) {
      updateFields.mark = req.body.score;
    }
    if (req.body.aiMarkingComplete) {
      updateFields.aiMarkingComplete = true;
    }

    if (Object.keys(updateFields).length > 0) {
      await examCompletionModel.findOneAndUpdate(
        { examId: exam._id, studentId: studentId },
        { $set: updateFields },
        { upsert: true }
      );
    }

    res.status(200).json('Responses submitted successfully');

    // FRONTEND BRIDGE: Generate fully structural payload with legacy shapes intact
    if (exam?.schoolId) {
      const examPayload = await populateExamWithEnrollment(exam._id);

      if(examPayload) {
        const io = getIo();
        io.emit('examEvent-' + exam.schoolId, { action: 'examUpdated', data: examPayload });
      }
    }
  } catch (error) {
    console.error("Error submitting responses:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/mark-current-question-as-complete/:id', async function (req, res) {
  try {
    const questionId = req.params.id;
    const studentId = req.body.currentUserId;

    const foundQuestion = await questionModel.findById(questionId);
    if (!foundQuestion) {
      return res.status(404).json({ message: 'Question not found' });
    }

    await questionSubmissionModel.findOneAndUpdate(
        { questionId: questionId, studentId: studentId, examId: foundQuestion.examId },
        { $set: { dateComplete: new Date() } },
        { upsert: true, new: true }
    );

    const course = await courseworkModel.findById(foundQuestion.examId)
    const minutes = course?.estimatedMinutesToComplete / course?.questions?.length

    if(foundQuestion) {
        await createStudentStat({
            studentId: studentId, 
            activityType: 'coursework',
            minutes: minutes ?? 10,
            date: Date.now(),
            comment: `course foundQuestion: ${foundQuestion.name}`,
            referenceId: foundQuestion._id,
        })
    }

    return res.json(foundQuestion);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Manually edit score of question for user
 */

router.patch('/manually-edit-question-score/:id', async function (req, res) {
  try {
    const questionId = req.params.id;
    const studentId = req.body.studentId;
    const score = req.body.score;

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" });
    }

    if (score === undefined || score === null) {
      return res.status(400).json({ message: "score is required" });
    }

    const foundQuestion = await questionModel.findById(questionId);

    if (!foundQuestion) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Update the mark directly on the isolated submission document
    const submission = await questionSubmissionModel.findOne({ 
        questionId: questionId, 
        studentId: studentId 
    });

    if (!submission) {
        return res.status(404).json({ message: 'Student submission not found' });
    }

    if (!submission.mark) submission.mark = {};
    submission.mark.totalMark = score.toString();
    await submission.save();

    return res.json(foundQuestion);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Save image/audio for exam question prompt to cloudinary
 */

async function saveQuestionPrompt(base64ExamPrompt, promptType, schoolId, examId) {
    const maxFileSizeMb = 10; // 10MB
    const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;

    // --- Estimate the Base64 file size before uploading - TODO - move to service
    const sizeInBytes = Buffer.byteLength(base64ExamPrompt, 'base64');
    if (sizeInBytes > maxFileSizeBytes) {
        throw new Error(`File too large. Max allowed size is ${maxFileSizeMb} MB.`);
    }

    const result = await cloudinary.uploader.upload(base64ExamPrompt, {
        folder: `${schoolId}/exam-prompts/${examId}`,
        resource_type: promptType === 'audio' ? 'video' : 'image' // Specify 'video' for audio files. Otherwise, upload an image
    }); // todo - move to service
  
  return result.secure_url;
}


// populate the exam with enrollment and completion so it can be returned correctly to the frontend end sockets
const populateExamWithEnrollment = async (examId) => {
  const exam = await examModel.findById(examId).lean();
  if (!exam) return null;

  const enrollments = await examEnrollmentModel.find({ examId });
  const completions = await examCompletionModel.find({ examId });

  return {
      ...exam,
      studentsEnrolled: enrollments.map(e => e.studentId),
      studentsCompleted: completions.map(c => ({ studentId: c.studentId, mark: c.mark })),
      aiMarkingComplete: completions.filter(c => c.aiMarked).map(c => ({ studentId: c.studentId }))
  };
};

module.exports = {
  router,
  createQuestion,
  deleteQuestion,
  populateExamWithEnrollment,
};
