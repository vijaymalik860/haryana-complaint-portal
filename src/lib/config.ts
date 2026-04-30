export const CCTNS_CONFIG = {
  secretKey: process.env.CCTNS_SECRET_KEY ?? "UserHryDashboard",
  aesKey:
    process.env.CCTNS_AES_KEY ??
    "O7yhrqWMMymKrM9Av64JkXo3GOoTebAyJlQ9diSxi0U=",
  tokenUrl:
    process.env.CCTNS_TOKEN_URL ??
    "http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ReqToken",
  complaintUrl:
    process.env.CCTNS_COMPLAINT_URL ??
    "http://api.haryanapolice.gov.in/phqdashboard/api/PHQDashboard/ComplaintData",
  districtsUrl:
    process.env.CCTNS_DISTRICTS_URL ??
    "https://api.haryanapolice.gov.in/eSaralServices/api/common/district",
  policeStationsUrl:
    process.env.CCTNS_POLICE_STATIONS_URL ??
    "https://api.haryanapolice.gov.in/eSaralServices/api/common/GetPSByDistrict",
  officesUrl:
    process.env.CCTNS_OFFICES_URL ??
    "https://api.haryanapolice.gov.in/eSaralServices/api/common/GetAllOffices",
};

