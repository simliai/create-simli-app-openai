import Image from "next/image";
import dottedface from "@/media/dottedface.gif";

export default function DottedFace() {
  return (
    <div className="flex justify-center items-center">
      <Image src={dottedface} alt="" width={350} height={350} unoptimized priority />
    </div>
  );
}
