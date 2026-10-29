export type PlatformAccount={id:string;name:string;issuer:string;subject:string;role:string;enabled:boolean;revision:number;allSites:boolean;siteIds:string[]};
export type PlatformSite={id:string;name:string;countryCode:string;revision:number};
export const platformOperations:Record<string,string>={company:'Entreprise créée',site:'Site créé',account:'Compte rattaché',access:'Accès modifiés',company_metadata:'Entreprise modifiée',site_metadata:'Site modifié'};
