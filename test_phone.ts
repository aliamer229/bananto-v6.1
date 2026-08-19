import { normalizePhone } from "./src/lib/phone.ts";
console.log(normalizePhone("07838455220"));
console.log(normalizePhone("+964 783 845 5220"));
console.log(normalizePhone("9647838455220"));
console.log(normalizePhone("009647838455220"));
console.log(normalizePhone("+9647838455220"));
