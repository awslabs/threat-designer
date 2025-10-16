import "./styles.css";

const textStyle = {
  paddingTop: "10px", // Adjusted padding
  paddingRight: "5px", // Adjusted padding
  pointerEvents: "none", // Make text not clickable
};

const ToolLoading = ({ text }) => {
  return (
    <span style={textStyle} className={"text-reveal"}>
      {text}
    </span>
  );
};

export default ToolLoading;
