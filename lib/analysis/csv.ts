export function parseCsv(text: string): Record<string, string>[] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  const finishRow = () => {
    row.push(field);
    if (row.some((value) => value.trim().length > 0)) rows.push(row);
    row = [];
    field = "";
    closedQuote = false;
  };

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0 || closedQuote) throw new Error("CSV 따옴표 위치가 올바르지 않습니다.");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
      closedQuote = false;
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index++;
      finishRow();
    } else {
      if (closedQuote) throw new Error("CSV 따옴표 뒤에 예상하지 못한 문자가 있습니다.");
      field += character;
    }
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  if (field.length > 0 || row.length > 0 || closedQuote) finishRow();
  if (rows.length === 0) throw new Error("CSV 헤더가 없습니다.");

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("CSV 헤더가 비어 있거나 중복되었습니다.");
  }
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV ${index + 2}행의 열 개수가 헤더와 다릅니다.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}
