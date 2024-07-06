"use server";

export default async function sendMesg(formData: FormData){
    console.log(formData.getAll("mesg"))
}
