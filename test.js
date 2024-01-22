function removeHtmlTags(inputString, excludeTags = []) {
    let resultString = inputString;
    // Exclude content inside specific tags
    excludeTags.forEach(tag => {
        const excludePattern = new RegExp(`<${tag}.*?</${tag}>`, 'gs');
        resultString = resultString.replace(excludePattern, '');
    });

    // Remove all HTML tags
    resultString = resultString.replace(/<.*?>/g, '');
    return resultString;
}


res = "<div>This is <b>bold</b> text. <span class='exclude'>This should be excluded.</span></div>";
console.log(removeHtmlTags(res, ['span']));