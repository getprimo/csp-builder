// Sample ADMX/ADML bundles, imported as raw strings so they work both via HTTP
// and inside the single-file build (no fetch required).

import chromeAdmx from "../samples/chrome/chrome.admx?raw";
import chromeAdml from "../samples/chrome/en-US/chrome.adml?raw";
import edgeAdmx from "../samples/edge/msedge.admx?raw";
import edgeAdml from "../samples/edge/en-US/msedge.adml?raw";
import edgeUpdateAdmx from "../samples/edge-update/msedgeupdate.admx?raw";
import edgeUpdateAdml from "../samples/edge-update/en-US/msedgeupdate.adml?raw";
import firefoxAdmx from "../samples/firefox/firefox.admx?raw";
import firefoxAdml from "../samples/firefox/en-US/firefox.adml?raw";
import onedriveAdmx from "../samples/onedrive/OneDrive.admx?raw";
import onedriveAdml from "../samples/onedrive/en-US/OneDrive.adml?raw";
import acrobatAdmx from "../samples/acrobat-dc/AdobeDC.admx?raw";
import acrobatAdml from "../samples/acrobat-dc/en-US/AdobeDC.adml?raw";
import readerAdmx from "../samples/reader-dc/ReaderDC.admx?raw";
import readerAdml from "../samples/reader-dc/en-US/ReaderDC.adml?raw";
import officeAdmx from "../samples/office/office16.admx?raw";
import officeAdml from "../samples/office/en-US/office16.adml?raw";
import wordAdmx from "../samples/word/word16.admx?raw";
import wordAdml from "../samples/word/en-US/word16.adml?raw";
import outlookAdmx from "../samples/outlook/outlk16.admx?raw";
import outlookAdml from "../samples/outlook/en-US/outlk16.adml?raw";

export interface SampleBundle {
  id: string;
  name: string;
  vendor: string;
  admxFileName: string;
  admlFileName: string;
  admxContent: string;
  admlContent: string;
  source: string;
  note?: string;
}

export const SAMPLES: SampleBundle[] = [
  {
    id: "chrome",
    name: "Google Chrome",
    vendor: "Google",
    admxFileName: "chrome.admx",
    admlFileName: "chrome.adml",
    admxContent: chromeAdmx,
    admlContent: chromeAdml,
    source:
      "dl.google.com/dl/edgedl/chrome/policy/policy_templates.zip (official)",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    vendor: "Microsoft",
    admxFileName: "msedge.admx",
    admlFileName: "msedge.adml",
    admxContent: edgeAdmx,
    admlContent: edgeAdml,
    source: "edgeupdates.microsoft.com (official Edge policy CAB)",
  },
  {
    id: "edge-update",
    name: "Microsoft Edge Update",
    vendor: "Microsoft",
    admxFileName: "msedgeupdate.admx",
    admlFileName: "msedgeupdate.adml",
    admxContent: edgeUpdateAdmx,
    admlContent: edgeUpdateAdml,
    source: "edgeupdates.microsoft.com (shipped in the Edge policy CAB)",
  },
  {
    id: "firefox",
    name: "Mozilla Firefox",
    vendor: "Mozilla",
    admxFileName: "firefox.admx",
    admlFileName: "firefox.adml",
    admxContent: firefoxAdmx,
    admlContent: firefoxAdml,
    source: "github.com/mozilla/policy-templates (official release asset)",
  },
  {
    id: "onedrive",
    name: "Microsoft OneDrive",
    vendor: "Microsoft",
    admxFileName: "OneDrive.admx",
    admlFileName: "OneDrive.adml",
    admxContent: onedriveAdmx,
    admlContent: onedriveAdml,
    source:
      "github.com/bastienperez/admx-onedrive (community mirror of OneDrive install payload)",
  },
  {
    id: "acrobat-dc",
    name: "Adobe Acrobat DC",
    vendor: "Adobe",
    admxFileName: "AdobeDC.admx",
    admlFileName: "AdobeDC.adml",
    admxContent: acrobatAdmx,
    admlContent: acrobatAdml,
    source:
      "github.com/systmworks/Adobe-DC-ADMX (community-maintained extended template)",
  },
  {
    id: "reader-dc",
    name: "Adobe Reader DC",
    vendor: "Adobe",
    admxFileName: "ReaderDC.admx",
    admlFileName: "ReaderDC.adml",
    admxContent: readerAdmx,
    admlContent: readerAdml,
    source:
      "github.com/nsacyber/Windows-Secure-Host-Baseline (Reader DC template)",
  },
  {
    id: "office",
    name: "Microsoft 365 Apps (shared)",
    vendor: "Microsoft",
    admxFileName: "office16.admx",
    admlFileName: "office16.adml",
    admxContent: officeAdmx,
    admlContent: officeAdml,
    source:
      "github.com/iothacker/Microsoft-Office-365-Business-Group-Policy-ADMX-Templates",
    note: "Shared cross-Office settings (office16-365.admx)",
  },
  {
    id: "word",
    name: "Microsoft Word",
    vendor: "Microsoft",
    admxFileName: "word16.admx",
    admlFileName: "word16.adml",
    admxContent: wordAdmx,
    admlContent: wordAdml,
    source:
      "github.com/iothacker/Microsoft-Office-365-Business-Group-Policy-ADMX-Templates",
  },
  {
    id: "outlook",
    name: "Microsoft Outlook",
    vendor: "Microsoft",
    admxFileName: "outlk16.admx",
    admlFileName: "outlk16.adml",
    admxContent: outlookAdmx,
    admlContent: outlookAdml,
    source:
      "github.com/iothacker/Microsoft-Office-365-Business-Group-Policy-ADMX-Templates",
  },
];
