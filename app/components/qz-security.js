'use client';

const CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIECzCCAvOgAwIBAgIGAaAk5yHRMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDgyMDE1MTg0MloXDTQ2MDgyMDE1MTg0MlowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCv
XRwp5hWOJxowMOj+Xa1vesLUdpw5X+tgkRVo2BzoMlOSJaBFJDPDV/uC2aOhtAAG
qj8G3V9iABTZxjNBQdZtqA37VXEvfgS/pScRpzIa7NTBn6gVAnXUuDBNatPDmxMn
PIajI/D+lT+OAgqD/PDD9In9cWszyOI4Gopq3QqqQLB4BWqjDWJp9Tcl2tHTn4T+
tJg0WKdMfDYClIAx22lzM40fm3R1UyLnczVZxqXJqQdAtAy4CSuTKFKwvdmKDgOh
MYUqcIEKJUHEyYTJ6qzl36yjhHHm65iMB7VfiLf1+1iS0LRq6o+ojQ292RHj30Bu
50Go6RDoJDTHVflgEhRbAgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBTVf1IoUDUi83cPPtU7LQezvPj6fDANBgkq
hkiG9w0BAQsFAAOCAQEAi2YtyxDO2PVfzDMc45JrCcV2EOalnQxs5KWwSzW2+zEb
AQ1kBcWp9z3wg3ay5FudsZkYAlU25q17Dd/y9+WKd3F5W9we8ikOazYRVGlMmB2V
JVkwTrN9W5i4adxU+rCzqu3zQCHtUcUwLqZDaipXxWd2i3cBhffo88NHOdPDQlUm
BzSbmsstiw4UTIQhogbjH0Iq5ao8NhkJYBLEu1G/PTeXmRHmMPob7AQrMXjFK8VC
p6nJIHP0Rh9vfJ6huHwV4p74imk9tfWJdUOnBlAAgLtPnLCxuiExnpX1YnvqUogU
OYbaILFKLM1RyKZtiLyomW/nN2pcx5gs2vqGOjmgHg==
-----END CERTIFICATE-----`;

let configured = false;

export function configureQzSecurity(qz) {
  if (configured) return;
  qz.security.setCertificatePromise((resolve) => resolve(CERTIFICATE));
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign) => async (resolve, reject) => {
    try {
      const response = await fetch('/api/qz-sign', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({request: toSign}),
      });
      if (!response.ok) throw new Error(`Signing failed: HTTP ${response.status}`);
      const data = await response.json();
      if (!data.signature) throw new Error('Signing failed: no signature');
      resolve(data.signature);
    } catch (error) {
      reject(error);
    }
  });
  configured = true;
}
