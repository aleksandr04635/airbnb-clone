export default function Image({ src, ...rest }) {
  src =
    src && (src.includes("https://") || src.includes("http://"))
      ? src
      : "http://localhost:4000/uploads/" + src;
  return <img {...rest} src={src} alt={""} />;
}
