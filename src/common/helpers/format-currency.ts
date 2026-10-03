export const formatRupiah = (val: string | number) => {
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num)) return String(val);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(num);
};
