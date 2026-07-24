import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyClearanceDepartmentEntries } from "../src/lib/clearance/clearance-form-layout";
import { buildClearanceFormPdf } from "../src/lib/clearance/clearance-pdf";

const departmentEntries = emptyClearanceDepartmentEntries();
departmentEntries[0] = { remarks: "No pending marketing assets.", signature: "S. Ahmed" };
departmentEntries[1] = { remarks: "All promotional items returned.", signature: "M. Raza" };
departmentEntries[2] = { remarks: "No outstanding advances.", signature: "Finance Officer" };
departmentEntries[3] = { remarks: "Purchase orders cleared.", signature: "Purchase Head" };
departmentEntries[4] = { remarks: "System access revoked.", signature: "MIS Admin" };
departmentEntries[5] = { remarks: "No pending correspondence.", signature: "Secretariat" };
departmentEntries[6] = { remarks: "ID card and keys returned.", signature: "Admin Officer" };
departmentEntries[7] = { remarks: "Exit interview completed.", signature: "HR Manager" };

const sampleData = {
  companyName: "Crest LED",
  companySlug: "crest-led",
  employeeCode: "EMP-1042",
  employeeName: "Ayesha Khan",
  department: "Administration",
  designation: "Senior Executive Assistant",
  departmentEntries,
};

const outputPath = resolve(process.cwd(), "docs/sample-clearance-form.pdf");

const buffer = await buildClearanceFormPdf(sampleData);
writeFileSync(outputPath, buffer);

console.log(`Sample clearance form written to ${outputPath}`);
