export default function VideoBox(props: any) {
    return (
        <div className="flex rounded-sm overflow-hidden items-center h-[768px] w-[1024px] justify-center bg-simligray">
            <video ref={props.video} autoPlay playsInline></video>
            <audio ref={props.audio} autoPlay ></audio>
        </div>
    );
}   