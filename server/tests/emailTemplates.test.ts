import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { renderBookingEmail,type EmailBooking,type EmailKind } from "../src/emailTemplates";

const booking:EmailBooking={id:"sample-booking",version:1,courtName:"Площадка №1",sport:"Бадминтон",hall:"Зал №1",date:"2026-12-01",start:"10:00",end:"11:30",status:"active",players:2,equipment:[],pricing:{totalAmount:150000}};
test("all booking emails embed the website logo as an inline PNG without external image URLs",async()=>{
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:"unix"});
  for(const kind of ["created","cancelled","rescheduled","reminder"] satisfies EmailKind[]){
    const email=renderBookingEmail(kind,{booking},"Игрок","http://localhost:5173");
    assert.equal(email.attachments.length,1);
    const logo=email.attachments[0];
    assert.equal(logo.contentType,"image/png");assert.equal(logo.contentDisposition,"inline");
    assert.equal(logo.content.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(logo.content.readUInt32BE(16),672);assert.equal(logo.content.readUInt32BE(20),228);
    assert.ok(email.html.includes(`src="cid:${logo.cid}"`));
    assert.ok(!/<img[^>]+src="https?:/i.test(email.html));
    assert.ok(email.html.includes('alt="Играем? — спортивный комплекс"'));
    const built=await transport.sendMail({from:"igraem.spb.booking@mail.ru",to:"preview@example.invalid",...email});
    const mime=built.message.toString();
    assert.ok(mime.includes("multipart/related"));
    assert.ok(mime.includes(`Content-ID: <${logo.cid}>`));
    assert.ok(mime.includes("Content-Type: image/png"));
    assert.ok(mime.includes("Content-Disposition: inline"));
  }
});

test("waitlist email contains the logo, safe booking link and no promise of a reserved place",async()=>{
 const {renderWaitlistEmail}=await import('../src/emailTemplates');
 const email=renderWaitlistEmail({courtId:4,courtName:'Зал <4>',sportId:'football',sport:'Футбол',date:'2026-12-01',start:'18:00',end:'19:30',duration:90},'<Имя & фамилия>','https://booking.example');
 assert.ok(email.html.includes('Зал &lt;4&gt;'));assert.ok(email.html.includes('&lt;Имя &amp; фамилия&gt;'));
 assert.ok(email.text.includes('sport=football'));assert.ok(email.text.includes('duration=90'));assert.ok(email.text.includes('start=18%3A00'));
 assert.ok(email.html.includes('src="cid:'+email.attachments[0].cid+'"'));assert.equal(email.attachments[0].contentType,'image/png');assert.ok(email.text.includes('Время не закрепляется'));
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
 const built=await transport.sendMail({from:'igraem.spb.booking@mail.ru',to:'preview@example.invalid',...email});
 assert.ok(built.message.toString().includes('multipart/related'));
});
