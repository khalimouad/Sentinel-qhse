import { Transform,Type } from 'class-transformer';
import { ArrayMaxSize,ArrayUnique,IsArray,IsBoolean,IsIn,IsInt,IsEmail,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength } from 'class-validator';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class PlatformQuery {
 @IsString() @MaxLength(200) search='';
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
 @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
class ReasonDto { @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) note!:string; }
export class CompanyDto extends ReasonDto {
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!:string;
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) region!:string;
 @IsArray() @ArrayMaxSize(50) @ArrayUnique() @Matches(/^[A-Z][A-Z0-9_-]{1,19}$/,{each:true}) jurisdictions!:string[];
}
export class PlatformSiteDto extends ReasonDto {
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!:string;
 @Matches(/^[A-Z]{2}$/) countryCode!:string;
}
class AccessFields extends ReasonDto {
 @IsIn(['admin','manager','reader']) role!:'admin'|'manager'|'reader';
 @IsBoolean() allSites!:boolean;
 @IsArray() @ArrayMaxSize(500) @ArrayUnique() @IsUUID(undefined,{each:true}) siteIds!:string[];
}
export class PlatformAccountDto extends AccessFields {
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!:string;
 // Subject is the exact immutable ID supplied by the identity provider, not an email inference.
 @IsString() @MinLength(1) @MaxLength(500) subject!:string;
}
export class PlatformAccessDto extends AccessFields {
 @IsUUID() userId!:string;
 @IsBoolean() enabled!:boolean;
 @IsInt() @Min(1) revision!:number;
}

export class CompanyMetadataDto extends CompanyDto {
 @IsInt() @Min(1) revision!:number;
}
export class SiteMetadataDto extends PlatformSiteDto {
 @IsInt() @Min(1) revision!:number;
}

export class PlatformAccountQuery extends PlatformQuery {
 @IsIn(['all','admin','manager','reader']) role='all';
 @IsIn(['all','active','suspended']) status='all';
}
export class PlatformHistoryQuery extends PlatformQuery {
 @IsIn(['all','company','site','account','access','company_metadata','site_metadata','invitation_request','invitation_cancel','invitation_delivery_started','invitation_delivery_result','invitation_reconcile','invitation_linked']) operation='all';
}

export class PlatformInvitationDto extends AccessFields {
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!:string;
 @Transform(trim) @IsEmail() @MaxLength(254) email!:string;
 @IsUUID() idempotencyKey!:string;
}

export class CancelPlatformInvitationDto extends ReasonDto {}

export class ReconcileInvitationDto extends ReasonDto { @IsUUID() subject!:string; }
