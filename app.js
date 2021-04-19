

'use strict';


const AWS = require('aws-sdk');
const jsftp = require("jsftp");
const { Parser, transforms: { unwind } } = require('json2csv');

var s3 = new AWS.S3();



const ftp = new jsftp({
    host: "abc.test.com",
    port: 21, 
    user: "abcd.test", 
    pass: "abcd1234",
    debugMode: true  
});


const databaseServices = require('../libs/databaseServices');
const mailer = require('../libs/mailer');
const { Promise } = require('mssql');


var returnData = {
    statusCode: 200,
    body: "Data Sent",
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true
    },
  };
  var process_output = {};
  
module.exports.index = async event => {

    

    try{
        
        let dbConn = await databaseServices.getConnectionPool();

        let dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 1);

        let aestTime = dateFrom.toLocaleString("en-US", {timeZone: "Australia/Sydney"});
        //console.log("from:"+aestTime);
        let  dateFromStr = dateToSqlDate(aestTime,false);

        let dateTo = new Date();
        aestTime = dateTo.toLocaleString("en-US", {timeZone: "Australia/Sydney"});
        //console.log("from:"+aestTime);
        let  dateToStr = dateToSqlDate(aestTime,false);



        let leadsDataObj = await databaseServices.getLeadsByDate(dbConn,dateFromStr,dateToStr);
        let leadsData = leadsDataObj.recordset;
       
        let fileName =  'File_To_Be_Send_In_Email_'+dateFromStr+'.csv';
        let FtpfileName =  'File_To_Be_Send_In_FTP.csv';

        

        var csv = await createCSVFile(leadsData);
        var buffer = Buffer.from(csv, 'utf8');

        const params = {
            Bucket: 'bucketNameInS3',
            Key: fileName,
            Body: buffer,
            ACL: 'public-read',
            ContentType:'text/csv'
          };
        const stored = await s3.upload(params).promise();
        /// -- > stored.Location to send by email
        //console.log(stored);
       
        let email = await sendEmail(dateFromStr,stored.Location);
        console.log("--------emailSent---------");


        let ftpResult = await uploadfileToFtp(buffer,FtpfileName);
        returnData.statusCode =  ftpResult.statusCode ;
        returnData.body =  ftpResult.body ;
        console.log("--------ftpResult -------",ftpResult);


        
    }catch(error){
        console.log("-------------- catch an error -------------");
        console.log(error);
        returnData.statusCode = 500;
        returnData.body = error.message;
    }

    return returnData;
}

var createCSVFile = (leadsData) => {

    let colNames = Object.keys(leadsData[0]);
   

    const fields = colNames;
    const transforms = [unwind({ paths: [], blankOut: true })];

    const json2csvParser = new Parser({ fields, transforms });
    let csvContent = json2csvParser.parse(leadsData);

    console.log("-------  csvContent -------",csvContent);

    return csvContent;
}

var  uploadfileToFtp = async(buffer,fileName) =>{
    return new Promise( async(resolve,reject) =>{
       await ftp.put(buffer, fileName, err => {
           if (!err){
                console.log("File transferred successfully!");
                resolve({statusCode:200,body:"File transferred successfully!"});
           }
           else {
               console.log("--- error ---",err);
               reject({statusCode:500,body:err});
           }
       });
    });
}

var dateToSqlDate = (dateStr,isDateTime) =>{
    dateStr = new Date(dateStr);
    dateStr = dateStr.getUTCFullYear()  + '-' +
            pad(dateStr.getUTCMonth() + 1) + '-' +
            pad(dateStr.getUTCDate() );
            
    if(isDateTime){  
        dateStr + ' ' +
        pad(dateStr.getUTCHours() )     + ':' +
        pad(dateStr.getUTCMinutes() )   + ':' +
        pad(dateStr.getUTCSeconds());
    }

    return  dateStr
}
var pad = function(num) { return ('00'+num).slice(-2) };


var sendEmail = async (dateStr,s3Link) =>{
  let isNZ =false;
  let domain = mailer.getDomain(isNZ);
  let params  = {};
  params.from = "Email";
  params.to = "EmailTo  , EmailTo ";
  params.cc = "EmailCC";
  params.subject = "Something";


  params.html = `
    <html>
        <body>
            Hi,
            <br>
            <p>
            Please click on button below to download the File ${dateStr} 
            </p>
            <center> 
                <br><br>
                <a href="${s3Link}" target="_blank">
                    <button style="width:70pt;height:40pt">File</button>
                </a>
            </center>
            
            <p>
            Kind Regards,
            <br>
            Aram Al-Zuhairi
            </p>
        </body>
    </html>
  `;

  return await mailer.send(domain, params);  
}
