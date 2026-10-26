import { ApiProperty } from '@nestjs/swagger';
import { IsIn,IsInt,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength } from 'class-validator';
import type { AttachmentParent } from '@sentinelle/contracts';
import { FILE_TYPES,MAX_FILE_BYTES } from './rules.mjs';
export class AttachmentParentDto{
  @ApiProperty({enum:['document_version','report']}) @IsIn(['document_version','report']) parentType!:AttachmentParent;
  @ApiProperty({format:'uuid'}) @IsUUID() parentId!:string;
}
export class UploadAttachmentDto extends AttachmentParentDto{
  @ApiProperty({maxLength:180}) @IsString() @MinLength(1) @MaxLength(180) filename!:string;
  @ApiProperty({enum:Object.keys(FILE_TYPES)}) @IsIn(Object.keys(FILE_TYPES)) mimeType!:string;
  @ApiProperty({minimum:1,maximum:MAX_FILE_BYTES}) @IsInt() @Min(1) @Max(MAX_FILE_BYTES) size!:number;
  @ApiProperty({pattern:'^[a-f0-9]{64}$'}) @Matches(/^[a-f0-9]{64}$/) sha256!:string;
}
export class RemoveAttachmentDto{@ApiProperty({minimum:1}) @IsInt() @Min(1) revision!:number;}
