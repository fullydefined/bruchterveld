function doGet(e) {
  // 1. Connect to the active spreadsheet and the specific tab
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Players");
  
  // 2. Read all the data (This returns a 2D array of rows and columns)
  // Note: If the sheet is completely empty, this will return a single empty string.
  // Add some dummy data (like "Name" and "Elo" headers) to your sheet first!
  const data = sheet.getDataRange().getValues();
  
  // 3. Package the data into a JSON object
  const responsePayload = {
    status: "success",
    message: "Connection successful! Hello from Google Apps Script.",
    playerData: data
  };
  
  // 4. Send it back out to the internet
  return ContentService
    .createTextOutput(JSON.stringify(responsePayload))
    .setMimeType(ContentService.MimeType.JSON);
}

// It's good practice to include doPost even if it's empty, to avoid 
// server errors if your frontend accidentally sends a POST request early.
function doPost(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "success", message: "POST received" }))
    .setMimeType(ContentService.MimeType.JSON);
}
