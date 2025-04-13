const mongoose = require('mongoose');

const messageRecipientsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    seenAt: {
        type: Date,
        required: false,
    },
});

const messageAttachmentSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true,
    },
    fileName: {
        type: String,
        required: true,
    },
});

const chatGroupSchema = new mongoose.Schema({
    groupName: {
        type: String,
        required: true,
    },
    members: [messageRecipientsSchema],
});

const messageSchema = new mongoose.Schema({
    messageText: {
        type: String,
        required: true,
    },
    senderId: {
        type: String,
        required: true,
    },
    recipients: {
        type: [messageRecipientsSchema],
        default: [],
    },
    deleted: {
        type: Boolean,
        required: true,
    },
    edited: {
        type: Date,
        required: false,
    },
    attachment: messageAttachmentSchema,
    chatGroupId: {
        type: String,
        required: false,
    },
    createdAt: {
        type: String,
        required: true,
    },
    parentMessageId: {
        type: String,
        required: false,
    },
    savedByIds: {
        type: [String],
        default: [],
    },
    replies: {
        type: [this], // Self-referencing array of messages (replies)
        default: [],
    },
});

// const ChatGroup = mongoose.model('ChatGroup', chatGroupSchema);
module.exports = mongoose.model('messageModel', messageSchema);

// module.exports = {
//     ChatGroup,
//     messageModel,
// };


// DEMO EXAMPLE FROM NESTJS:

// import { OmitType } from '@nestjs/mapped-types';
// import { Expose, Type } from 'class-transformer';
// import {
//   IsBoolean,
//   IsNotEmpty,
//   IsOptional,
//   IsString,
//   ValidateNested,
// } from 'class-validator';

// export class MessageRecipinets {
//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   userId: string;

//   @IsString()
//   @IsOptional()
//   @Expose()
//   seenAt?: string;
// }

// export class MessageAttachment {
//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   url: string;

//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   fileName: string;
// }

// export class ChatGroupDto {
//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   _id: string;

//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   groupName: string;

//   @ValidateNested({ each: true })
//   @Type(() => MessageRecipinets)
//   @Expose()
//   members: MessageRecipinets[];
// }

// export class CreateChatGroupDto extends OmitType(ChatGroupDto, ['_id']) {}

// export class MessageDto {
//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   _id: string;

//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   messageText: string;

//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   senderId: string;

//   @ValidateNested({ each: true })
//   @Type(() => MessageRecipinets)
//   @IsOptional()
//   @Expose()
//   recipients?: MessageRecipinets[];

//   @IsBoolean()
//   @IsNotEmpty()
//   @Expose()
//   deleted: boolean;

//   @IsBoolean()
//   @IsNotEmpty()
//   @Expose()
//   edited: boolean;

//   @ValidateNested()
//   @Type(() => MessageAttachment)
//   @IsOptional()
//   @Expose()
//   attachment?: MessageAttachment;

//   @IsString()
//   @IsOptional()
//   @Expose()
//   chatGroupId?: string;

//   @IsString()
//   @IsNotEmpty()
//   @Expose()
//   createdAt: string;

//   @IsString()
//   @IsOptional()
//   @Expose()
//   parentMessageId?: string;

//   @IsString()
//   @IsOptional()
//   @Expose()
//   savedByIds?: string[];

//   @ValidateNested({ each: true })
//   @Type(() => MessageDto)
//   @IsOptional()
//   @Expose()
//   replies?: MessageDto[];
// }

// export class CreateMessageDto extends OmitType(MessageDto, [
//   '_id',
//   'createdAt',
// ]) {}
