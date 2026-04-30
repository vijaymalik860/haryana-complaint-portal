# CCTNS Standalone API Documentation

This document provides technical details for the CCTNS API services used by the Haryana Police PHQ Complaint Dashboard.

---

## 1. Authentication (Token Generation)

Access to CCTNS endpoints requires a short-lived Bearer token.

- **Endpoint**: `http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ReqToken`
- **Method**: `GET`
- **Query Parameter**:
  - `SecretKey`: `UserHryDashboard` (or as configured)
- **Response**: A raw string containing the Access Token.
  - *Note*: The response may be wrapped in XML tags (e.g., `<string xmlns="...">TOKEN</string>`) or returned as a quoted JSON string.

**Example Request**:
```http
GET http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ReqToken?SecretKey=UserHryDashboard
```

---

## 2. PHQ Dashboard (Complaint Data)

This endpoint is used to fetch complaint records within a specific date range.

- **Endpoint**: `http://api.haryanapolice.gov.in/phqdashboard/api/PHQDashboard/ComplaintData`
- **Method**: `GET`
- **Headers**:
  - `Authorization`: `Bearer <token>`
- **Query Parameters**:
  - `TimeFrom`: Start date (Format: `DD/MM/YYYY`)
  - `TimeTo`: End date (Format: `DD/MM/YYYY`)
- **Response**: An array of complaint objects. The response might be AES-encrypted (see section 4).

**Example Request**:
```http
GET http://api.haryanapolice.gov.in/phqdashboard/api/PHQDashboard/ComplaintData?TimeFrom=01/04/2026&TimeTo=07/04/2026
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 3. Reference Data Endpoints

These endpoints provide master data for filtering and categorization.

### A. Districts
- **Endpoint**: `https://api.haryanapolice.gov.in/eSaralServices/api/common/district`
- **Method**: `GET`
- **Headers**: `Accept: application/json`

### B. Police Stations (by District)
- **Endpoint**: `https://api.haryanapolice.gov.in/eSaralServices/api/common/GetPSByDistrict`
- **Method**: `GET`
- **Query Parameters**:
  - `state`: `13` (Haryana State Code)
  - `district`: `<DistrictID>`
- **Headers**: `Accept: application/json`

### C. All Offices
- **Endpoint**: `https://api.haryanapolice.gov.in/eSaralServices/api/common/GetAllOffices`
- **Method**: `GET`
- **Headers**: `Accept: application/json`

---

## 4. Decryption Mechanism

The data returned by the Complaint API may be encrypted using AES-256-CBC.

### Parameters
- **Algorithm**: `AES-256-CBC`
- **Key**: `O7yhrqWMMymKrM9Av64JkXo3GOoTebAyJlQ9diSxi0U=`
- **IV (Initialization Vector)**: The first 16 bytes of the base64-decoded response string.

### Logic
1. Base64-decode the response string into a Buffer.
2. Extract the first 16 bytes as the **IV**.
3. Use the remaining bytes as the **Encrypted Content**.
4. Decrypt using the **Key** and **IV** to obtain the UTF-8 JSON string.
