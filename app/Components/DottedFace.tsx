import Image from "next/image";
import dottedface from "@/media/dottedface.gif";

export default function DottedFace() {
  return (
    <div className="aspect-video w-full flex justify-center items-center rounded-sm bg-simligray">
      <Image src={dottedface} alt="" width={300} height={300} unoptimized priority />
    </div>
  );
}
